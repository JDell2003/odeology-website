const fs=require('fs');
const path=require('path');
const Module=require('module');
const f=path.resolve('core/trainingRoutes.js');
const c=fs.readFileSync(f,'utf8')+'\nmodule.exports.__d={repairOblueprintBodybuildingPlan,assertOblueprintBodybuildingIntegrity};';
const m=new Module(f,module); m.filename=f; m.paths=Module._nodeModulePaths(path.dirname(f)); m._compile(c,f);
console.log('compiled');
const a=m.exports.__d.repairOblueprintBodybuildingPlan;
const s=m.exports.__d.assertOblueprintBodybuildingIntegrity;
const b=require('./generator/trainingEngine.oblueprint').buildOblueprintPlan;
const p={trainingFeel:'Aesthetic bodybuilding',primaryGoal:'Build size',timeline:'8 weeks',focus:'Aesthetic',experience:'6-24m',location:'Commercial gym',trainingStyle:'Balanced mix',outputStyle:'RPE/RIR cues',closeToFailure:'No',daysPerWeek:6,sessionLengthMin:'60',priorityGroups:['glutes'],movementsToAvoid:[],preferredDays:[],equipmentAccess:['barbell','dumbbell','machine','cable'],painAreas:[],painProfilesByArea:{},sleepHours:7,activityLevel:'Active',stress:'Medium',planSeed:Date.now()};
const out=b(p);
const r=a(out);
try { s(r); console.log('PASS'); } catch(e){ console.log('FAIL',e.message); }
