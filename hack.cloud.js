/** @type {NS} **/
let ns

//Target optimizer for hack.cloud (requires Formulas.exe)
function printTable(data) {
  // Check if the array is empty
  if (data.length === 0) {
    console.log("Array is empty.");
    return;
  }

  // Extracting keys from the first object
  const keys = Object.keys(data[0]);

  // Print header row
  ns.tprint(keys.join(','));

  // Print data rows
  data.forEach(obj => {
    const values = keys.map(key => obj[key]);
    ns.tprint(values.join(','));
  });
}

export async function caseAttack(script,server,target,number) {
  if(!ns.fileExists(script,server)) {await ns.scp(script,server,"home")}
  await ns.exec(script,server,9,target,number)
}

export function composeArray(x, xstring, y, ystring, z, zstring) {
  function shuffle(array) {
    let currentIndex = array.length,  randomIndex;

    // While there remain elements to shuffle.
    while (currentIndex > 0) {

      // Pick a remaining element.
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;

      // And swap it with the current element.
      [array[currentIndex], array[randomIndex]] = [
        array[randomIndex], array[currentIndex]];
    }

    return array;
  }

  const resultArray = [];
  for (let i = 0; i < x; i++) {
    resultArray.push(xstring);
  }
  for (let i = 0; i < y; i++) {
    resultArray.push(ystring);
  }
  for (let i = 0; i < z; i++) {
    resultArray.push(zstring);
  }
  return shuffle(resultArray);
}

/** @param {NS} ns */
export async function main(_ns) {
  ns = _ns
  if(!ns.fileExists('Formulas.exe','home')) {throw new Error('Formulas.exe is required')}
  //We want to look through the rooted servers and identify, at min sec / max money:
  //* the amount of money returned by hack and it's percentage of max.
  //* the amount of time to hack
  //* the probability of a hack
  // Ideally, we would eventually figure out how much growing / weakening is needed to maintain this also so we can get $ / ram / second.
  let serverInfo = JSON.parse(await ns.read("servers.txt"))
  let hackSkill = ns.getHackingLevel(ns)
  
  //The above functionality really is going to need formulas.exe, which needs to be unlocked. 
  //Instead, let's just list the top few servers by ratio of max money to min security level

  let targets = new Array;
  let me = ns.getPlayer();
  for(let i=0; i<serverInfo.length; i++) {
    let cores=1;
    if(serverInfo[i]['rooted'] & serverInfo[i].hacklevel < hackSkill) {
      let newtarget = {'hostname':serverInfo[i].hostname};
      //Set up the hypothetical server after prepping
      let hypServer=ns.getServer(newtarget.hostname)
      
      hypServer.moneyAvailable=hypServer.moneyMax;
      hypServer.hackDifficulty=hypServer.minDifficulty;
      hypServer.hackChance = ns.formulas.hacking.hackChance(hypServer,me);
      hypServer.hackTime = ns.formulas.hacking.hackTime(hypServer,me);
      hypServer.hackPercent = ns.formulas.hacking.hackPercent(hypServer,me)*4;
      hypServer.hackMoney = hypServer.hackPercent*hypServer.moneyMax;
      hypServer.weakenTime = ns.formulas.hacking.weakenTime(hypServer,me);
      hypServer.growTime = ns.formulas.hacking.growTime(hypServer,me);
      hypServer.moneyAvailable = hypServer.moneyAvailable - hypServer.hackMoney;
      hypServer.growNeeded = Math.ceil(ns.formulas.hacking.growThreads(hypServer,me,hypServer.moneyMax,cores));
      hypServer.growNeeded_dilated = Math.ceil((17/16)*hypServer.growNeeded*hypServer.growTime/hypServer.hackTime)
      hypServer.secGain = ns.growthAnalyzeSecurity(hypServer.growNeeded,hypServer.hostname,cores) + ns.hackAnalyzeSecurity(4,hypServer.hostname);
      hypServer.weakNeeded = Math.ceil(hypServer.secGain/.05)
      hypServer.weakNeeded_dilated = Math.ceil((17/16)*hypServer.weakNeeded*hypServer.weakenTime/hypServer.hackTime)
      // we need threads per period of time, not strict procedural order.
      hypServer.totThreads=1+hypServer.weakNeeded_dilated+hypServer.growNeeded_dilated
      hypServer.rate=hypServer.hackMoney/(hypServer.hackTime*hypServer.totThreads)
      targets.push(hypServer)
    }
  }
  targets.sort((a,b) => b.rate - a.rate);

  ns.tprint('I suggest these 5 targets:')
  ns.tprint('#\tHost        \t$M\t\t$A\t\t\tSec\tRate')
  let i=0
  let j=5
  while(i<j) {
    if(targets[i].hacklevel > hackSkill) {
      //ns.tprint('target min hack level is '+targets[i].hacklevel+' but yours is '+hackSkill); 
      i++;
      j++;
      continue
      }
    let out=[i,targets[i]['hostname'].padEnd(12,' '),targets[i]['moneyMax'],targets[i].moneyAvailable,targets[i].minDifficulty,targets[i]['rate']];
    ns.tprint(out.join('\t'));
    i++;
  }

  let tnum=ns.args[0];

  if(await ns.prompt('Execute cloudhack on ' + targets[tnum].hostname + "?")) {
    let cycle=composeArray(targets[0].weakNeeded_dilated,"sub.infweaken.js",
                           targets[0].growNeeded_dilated,"sub.infgrow.js",
                           1,"sub.infHack.js");
    let waitTime=Math.ceil(targets[0].growTime/(cycle.length*1200*25));
    ns.tprint("Cycle is" + cycle);
    ns.tprint("Wait time is "+waitTime)
    let scriptcount=0;
    //for(let i=1; i<serverInfo.length; i++) { // skip home
    for(let i=0; i < serverInfo.length; i++) { // skip home
    if(serverInfo[i]['rooted']) {
      while(ns.getServerMaxRam(serverInfo[i].hostname) - ns.getServerUsedRam(serverInfo[i].hostname) > 16) {
        let attackindex=scriptcount % cycle.length;
        await caseAttack(cycle[attackindex],serverInfo[i].hostname,targets[0].hostname,scriptcount)
        scriptcount++
        await ns.sleep(waitTime)
      }
    }
  }
  ns.print("Estimated $/second is " + targets[0].rate*9*(scriptcount+1))
  }
}
