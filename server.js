// AI-Based Complaint Priority Assistant - demo backend (Express + JWT + bcrypt + rule/NLP priority engine)
const express=require('express'),fs=require('fs'),path=require('path'),bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken');
const app=express();app.use(express.json());app.use(express.static(path.join(__dirname,'public')));
const SECRET=process.env.JWT_SECRET,DB=path.join(__dirname,'data.json');
if(!SECRET)throw new Error('JWT_SECRET environment variable is required');
let db=fs.existsSync(DB)?JSON.parse(fs.readFileSync(DB)):{users:[],complaints:[],notes:[],seq:146};
const save=()=>fs.writeFileSync(DB,JSON.stringify(db,null,1));
if(!db.users.length){
  db.users.push({id:1,name:'Admin Officer',email:'admin@demo.com',mobile:'9999999999',role:'admin',hash:bcrypt.hashSync('admin123',8)},
                {id:2,name:'Demo User',email:'user@demo.com',mobile:'8888888888',role:'complainant',hash:bcrypt.hashSync('user123',8)});save();}

// ---------- AI analysis layer ----------
const CATS={Water:['water','pipeline','pipe','tap','drain'],Electricity:['electric','transformer','power','light','wire','spark','voltage'],
 Sanitation:['garbage','waste','sewage','sanitation','dustbin'],Roads:['road','pothole','traffic','bridge','street'],
 Safety:['gas','fire','smoke','accident','injury','explosion','theft']};
const KW={critical:['gas smell','gas leak','gas leakage','fire','explosion','sparking','electrocut','injury','injured','dizzy','accident','burst','flooding','collapse','emergency','unconscious'],
 high:['urgent','danger','risk','no water','power cut','outage','blocked','overflow','children','health','since morning','hazard'],
 medium:['not working','broken','delay','garbage','pothole','dark','noise','leak']};
const NEG=['danger','worst','terrible','unsafe','dizzy','suffering','angry','bad','severe','immediately','please help','risk'];
const SLA={Critical:1,High:8,Medium:48,Low:120};
function analyze(title='',desc='',cat){
  const t=(title+' '+desc).toLowerCase(),found=[];let s=0;
  KW.critical.forEach(k=>t.includes(k)&&(found.push(k),s+=.35));
  KW.high.forEach(k=>t.includes(k)&&(found.push(k),s+=.15));
  KW.medium.forEach(k=>t.includes(k)&&(found.push(k),s+=.07));
  const neg=NEG.filter(k=>t.includes(k)).length;s+=neg*.05+(t.includes('!')?.05:0);
  let best=cat,bs=0;for(const[c,w]of Object.entries(CATS)){const n=w.filter(k=>t.includes(k)).length;if(n>bs){bs=n;best=c}}
  s=Math.min(1,s);const priority=s>=.7?'Critical':s>=.4?'High':s>=.2?'Medium':'Low';
  return{category:best||'General',priority,score:+s.toFixed(2),confidence:Math.round(Math.min(.99,.62+s*.37)*100),keywords:[...new Set(found)].slice(0,6),
   sentiment:neg>=2||s>=.7?'Negative (urgent tone)':neg?'Negative':'Neutral',slaHours:SLA[priority],
   explanation:found.length?`Detected: ${[...new Set(found)].slice(0,4).join(', ')}. Recommended response within ${SLA[priority]}h.`:'No urgency indicators found; treated as routine.'};
}
// ---------- auth ----------
const auth=(req,res,next)=>{try{req.user=jwt.verify((req.headers.authorization||'').slice(7),SECRET);next()}catch{res.status(401).json({error:'Unauthorized'})}};
const adminOnly=(req,res,next)=>req.user.role==='admin'?next():res.status(403).json({error:'Admin only'});
const tok=u=>({token:jwt.sign({id:u.id,role:u.role,name:u.name},SECRET,{expiresIn:'8h'}),user:{id:u.id,name:u.name,email:u.email,role:u.role}});
app.post('/api/auth/register',(req,res)=>{const{name,email,mobile,password,role}=req.body;
  if(!name||!email||!password||password.length<6)return res.status(400).json({error:'Name, email and password (6+ chars) required'});
  if(db.users.find(u=>u.email===email))return res.status(409).json({error:'Email already registered'});
  const u={id:Date.now(),name,email,mobile,role:role==='admin'?'admin':'complainant',hash:bcrypt.hashSync(password,8)};db.users.push(u);save();res.json(tok(u))});
app.post('/api/auth/login',(req,res)=>{const u=db.users.find(x=>x.email===req.body.email);
  if(!u||!bcrypt.compareSync(req.body.password||'',u.hash))return res.status(401).json({error:'Invalid credentials'});res.json(tok(u))});
// ---------- complaints ----------
const note=(userId,msg)=>{db.notes.unshift({userId,msg,at:new Date().toISOString()})};
app.post('/api/analyze',auth,(req,res)=>res.json(analyze(req.body.title,req.body.description,req.body.category)));
app.post('/api/complaints',auth,(req,res)=>{const{title,description,category,location,image}=req.body;
  if(!title||!description)return res.status(400).json({error:'Title and description required'});
  const a=analyze(title,description,category),now=new Date();
  const c={id:`CMP-2026-${String(++db.seq).padStart(4,'0')}`,userId:req.user.id,userName:req.user.name,title,description,category:a.category,location,image,
   priority:a.priority,confidence:a.confidence,keywords:a.keywords,sentiment:a.sentiment,explanation:a.explanation,
   deadline:new Date(+now+a.slaHours*36e5).toISOString(),status:'Submitted',officer:null,remarks:'',createdAt:now.toISOString(),
   history:[{s:'Submitted',t:now.toISOString()},{s:`AI Analysed - ${a.priority}`,t:now.toISOString()}]};
  db.complaints.push(c);note(req.user.id,`Your complaint ${c.id} was marked ${a.priority.toUpperCase()} by AI (${a.confidence}%).`);save();res.json(c)});
const RANK={Critical:0,High:1,Medium:2,Low:3};
app.get('/api/complaints',auth,(req,res)=>{let l=req.user.role==='admin'?db.complaints:db.complaints.filter(c=>c.userId===req.user.id);
  l=[...l].sort((a,b)=>req.user.role==='admin'?(RANK[a.priority]-RANK[b.priority]||new Date(a.deadline)-new Date(b.deadline)):new Date(b.createdAt)-new Date(a.createdAt));res.json(l)});
app.put('/api/complaints/:id',auth,adminOnly,(req,res)=>{const c=db.complaints.find(x=>x.id===req.params.id);if(!c)return res.status(404).json({error:'Not found'});
  const{officer,status,remarks}=req.body;if(officer&&officer!==c.officer){c.officer=officer;c.history.push({s:`Assigned to ${officer}`,t:new Date().toISOString()});note(c.userId,`${c.id} has been assigned to ${officer}.`)}
  if(status&&status!==c.status){c.status=status;c.history.push({s:status,t:new Date().toISOString()});if(status==='Resolved')c.resolvedAt=new Date().toISOString();note(c.userId,`${c.id} status is now ${status}.`)}
  if(remarks!==undefined)c.remarks=remarks;save();res.json(c)});
app.get('/api/notifications',auth,(req,res)=>res.json(db.notes.filter(n=>n.userId===req.user.id).slice(0,30)));
app.get('/api/analytics',auth,(req,res)=>{const l=req.user.role==='admin'?db.complaints:db.complaints.filter(c=>c.userId===req.user.id),cnt=k=>l.reduce((o,c)=>(o[c[k]]=(o[c[k]]||0)+1,o),{});
  const r=l.filter(c=>c.resolvedAt),avg=r.length?r.reduce((s,c)=>s+(new Date(c.resolvedAt)-new Date(c.createdAt)),0)/r.length/36e5:0;
  res.json({total:l.length,avgResolutionHours:+avg.toFixed(1),byPriority:cnt('priority'),byCategory:cnt('category'),byStatus:cnt('status')})});
app.post('/api/chat',auth,(req,res)=>{const m=(req.body.message||'').toLowerCase();
  const a=m.includes('critical')||m.includes('priority')?'Critical complaints involve safety, health or essential-service risk (e.g. gas leaks). They go to the top of the queue with a 1-hour response target.':
   m.includes('track')||m.includes('status')?'Open the Track tab and pick your complaint to see every stage from Submitted to Resolved.':
   m.includes('submit')||m.includes('register')?'Tap "+ New Complaint", fill the details, press "Analyze with AI" to preview the priority, then submit.':
   'I can help you submit a complaint, track its status or explain priority levels. What would you like to know?';res.json({reply:a})});
if(require.main===module){
  app.listen(process.env.PORT||3000,()=>console.log('ACPA demo running at http://localhost:'+(process.env.PORT||3000)));
}

module.exports=app;
