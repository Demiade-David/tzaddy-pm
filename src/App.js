import './App.css';
import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";

const SERVICES = ["CAC Business Registration","Tax Registration (TIN/VAT)","Tax Filing & Compliance","Payments on Client's Behalf","Bookkeeping & Accounting","Financial Statement Preparation","Business Advisory / CFO","Others"];
 const STAGES = ["In Discussion","Proposal Sent","Deal Sealed","Awaiting Payment","In Progress","Delivered"];
 const STAGE_NEXT = {"In Discussion":"Proposal Sent","Proposal Sent":"Deal Sealed","Deal Sealed":"Awaiting Payment","Awaiting Payment":"In Progress","In Progress":"Delivered"};
 const STAGE_PROMPT = {"In Discussion":"➜  Finalise scope and send proposal to client.","Proposal Sent":"➜  Follow up. Update once deal is confirmed.","Deal Sealed":"➜  Request payment before commencing work.","Awaiting Payment":"➜  Record payment as soon as received.","In Progress":"➜  Execute engagement. Check off deliverables.","Delivered":"✓  Engagement closed."};
 const SERVICE_TASKS = {
   "CAC Business Registration":["Collect incorporation documents","Complete CAC pre-registration online","File with CAC and pay government fees","Receive certificate of incorporation","Deliver certificate to client"],
   "Tax Registration (TIN/VAT)":["Collect KYC & supporting documents","Register TIN with NRS","Register for VAT (if applicable)","Obtain TIN/VAT certificates","Deliver certificates to client"],
   "Tax Filing & Compliance":["Obtain financial records from client","Prepare tax computation","Review computation with client","File returns with NRS","Obtain filing confirmation/receipt","Send confirmation to client"],
   "Payments on Client's Behalf":["Confirm payment details and amount","Collect funds from client","Execute payment","Obtain receipt","Reconcile and report to client"],
   "Bookkeeping & Accounting":["Collect all source documents","Post transactions to ledger","Perform bank reconciliation","Prepare trial balance","Review with client"],
   "Financial Statement Preparation":["Confirm bookkeeping is complete","Prepare draft financial statements","Review with client","Finalise and sign off statements","Deliver signed financials"],
   "Business Advisory / CFO":["Conduct business assessment","Prepare analysis/advisory report","Present findings to client","Implement agreed recommendations","Post-implementation review"],
   "Others":["Define scope with client","Execute engagement","Deliver output to client"]
 };
 
 // Storage
 const db = {
   get: async (k,d) => { try { const r = await window.storage.get(k); return r?JSON.parse(r.value):d; } catch { return d; } },
   set: async (k,v) => { try { await window.storage.set(k,JSON.stringify(v)); } catch {} }
 };
 
 // Utils
 const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,7);
 const N = n => new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(n||0);
 const dt = d => d?new Date(d).toLocaleDateString("en-NG",{day:"numeric",month:"short",year:"numeric"}):"—";
 const sum = a => a.reduce((x,y)=>x+(Number(y)||0),0);
 const mk = d => new Date(d).toLocaleDateString("en-NG",{month:"short",year:"2-digit"});
 
 // AI
 async function callClaude(messages,mcpServers=[]){
   const body={model:"claude-sonnet-4-20250514",max_tokens:1000,messages};
   if(mcpServers.length>0) body.mcp_servers=mcpServers;
   const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
   return r.json();
 }
 
 async function parseConversation(text){
   const d=await callClaude([{role:"user",content:`Extract info from this conversation. Return ONLY valid JSON:
 {"client_name":"","business_name":"","phone":"","email":"","services":[],"notes":"","estimated_fee":0}
 Services must be from: CAC Business Registration, Tax Registration (TIN/VAT), Tax Filing & Compliance, Payments on Client's Behalf, Bookkeeping & Accounting, Financial Statement Preparation, Business Advisory / CFO, Others
 Conversation:\n${text}`}]);
   const t=d.content?.find(b=>b.type==="text")?.text||"{}";
   return JSON.parse(t.replace(/"""json"""|/g,"").trim());
 }
 
 async function sendViaGmail(to,subject,body){
   return callClaude([{role:"user",content:`Send this email via Gmail now.\nTo: ${to}\nSubject: ${subject}\nBody:\n${body}\n\nSend it.`}],[{type:"url",url:"https://gmail.mcp.claude.com/mcp",name:"gmail"}]);
 }
 
 // Document builders
 function buildProposal(client,eng){
   const today=new Date().toLocaleDateString("en-NG",{day:"numeric",month:"long",year:"numeric"});
   const lines=(eng.feeItems||[]).map(f=>`    ${f.service.padEnd(42)} ${N(f.fee)}`).join("\n");
   return `Dear ${client.name},\n\nThank you for the opportunity to serve ${client.business||"you"}.\n\nFollowing our discussions, please find our formal proposal below:\n\n${"-".repeat(56)}\nSCOPE OF SERVICES & FEES\n${"-".repeat(56)}\n${lines}\n\n    ${"TOTAL PROFESSIONAL FEE".padEnd(42)} ${N(eng.totalFee)}\n${"-".repeat(56)}\n\nPAYMENT TERMS\n50% upfront before commencement; balance upon delivery.\nGovernment levies and third-party costs are charged at cost.\n\nVALIDITY: 30 days from ${today}.\n\nWarm regards,\nElizabeth\nTzaddy Consulting\n\n${today}`;
 }
 
 function buildInvoice(client,eng,pays){
   const today=new Date().toLocaleDateString("en-NG",{day:"numeric",month:"long",year:"numeric"});
   const paid=sum(pays.map(p=>p.amount));
   const bal=(eng.totalFee||0)-paid;
   const lines=(eng.feeItems||[]).map(f=>`   ${f.service.padEnd(42)} ${N(f.fee)}`).join("\n");
   return `INVOICE\n\nTo:   ${client.name}${client.business?`\n      ${client.business}`:""}\nDate: ${today}\n\n${"-".repeat(56)}\nSERVICES RENDERED\n${"-".repeat(56)}\n${lines}\n\n    ${"TOTAL FEE".padEnd(42)} ${N(eng.totalFee)}\n    ${"AMOUNT RECEIVED".padEnd(42)} ${N(paid)}\n    ${"BALANCE DUE".padEnd(42)} ${N(bal)}\n${"-".repeat(56)}\n\n${bal<=0?"PAID IN FULL — Thank you.":"Please arrange payment of the outstanding balance."}\n\nTzaddy Consulting · ${today}`;
 }
 
 function printDoc(title,content,docType){
   const w=window.open("","_blank");
   if(!w){alert("Allow pop-ups to export."); return;}
   w.document.write(`<!DOCTYPE html><html><head><meta charset=utf-8><title>${title}</title><style>@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=IBM+Plex+Mono:wght@400;600&display=swap');*{box-sizing:border-box;margin:0;padding:0}body{font-family:'IBM Plex Mono',monospace;padding:64px 72px;color:#0a0a0a;max-width:740px;margin:0 auto}.firm{font-family:'Playfair Display',serif;font-size:26px;letter-spacing:6px;font-weight:700;margin-bottom:4px}.tag{font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-bottom:32px}hr{border:none;border-top:2px solid #0a0a0a;margin:22px 0}.dtype{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#888;margin-bottom:24px}pre{font-family:'IBM Plex Mono',monospace;font-size:13px;line-height:1.85;white-space:pre-wrap;word-break:break-word}.foot{margin-top:48px;font-size:10px;color:#bbb;border-top:1px solid #e0ddd5;padding-top:12px}.pbtn{margin-bottom:24px;background:#0a0a0a;color:#fff;border:none;padding:7px 18px;font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;border-radius:2px}@media print{.pbtn{display:none}}</style></head><body><button class=pbtn onclick=window.print()>Save as PDF</button><div class=firm>TZADDY</div><div class=tag>Accounting · Tax · Advisory</div><hr><div class=dtype>${docType}</div><pre>${content}</pre><div class=foot>Tzaddy Consulting · Ibadan, Nigeria · CAC Accredited · QuickBooks Online Accountant</div></body></html>`);
   w.document.close();
 }
 
 function openWA(phone,msg){
   if(!phone){alert("No phone number. Add one in Clients.");return;}
   const c=phone.replace(/\D/g,"");
   const n=c.startsWith("234")?c:c.startsWith("0")?"234"+c.slice(1):"234"+c;
   window.open(`https://wa.me/${n}?text=${encodeURIComponent(msg)}`, "_blank");
 }
 
 function waProposal(client,eng){
   return `Hello ${client.name.split(" ")[0]},\n\nGood day. Following our discussion regarding ${client.business||"your business"}, I am pleased to share our proposal.\n\nServices:\n${(eng.services||[]).map(s=>` ${s}`).join("\n")}\n\nTotal Professional Fee: ${N(eng.totalFee)}\n\nI will send a formal written proposal to your email shortly.\n\nRegards,\nElizabeth | Tzaddy Consulting`;
 }
 
 // Shared UI
 const inp={width:"100%",border:"1px solid #ddd",padding:"8px 10px",fontSize:"12px",borderRadius:"2px",fontFamily:"'IBM Plex Mono',monospace",background:"#fff"};
 
 function PageTitle({children,actions}){
   return(<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"22px",paddingBottom:"10px",borderBottom:"2px solid #0a0a0a"}}>
     <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:"22px",fontWeight:"700"}}>{children}</h1>
     {actions&&<div style={{display:"flex",gap:"7px"}}>{actions}</div>}
   </div>);
 }
 
 function Badge({stage}){
   const m={"In Discussion":["#f0ede5","#888"],"Proposal Sent":["#fffbea","#9a7000"],"Deal Sealed":["#edfaee","#2e7d32"],"Awaiting Payment":["#fff4e0","#c04400"],"In Progress":["#e8f4fd","#1a6ba0"],"Delivered":["#0a0a0a","#fff"]};
   const [bg,cl]=m[stage]||["#f0f0f0","#333"];
   return <span style={{background:bg,color:cl,padding:"3px 9px",borderRadius:"2px",fontSize:"10px",fontWeight:"600",letterSpacing:"0.5px",whiteSpace:"nowrap"}}>{stage}</span>;
 }
 
 function Modal({title,onClose,children,width=580}){
   return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}}>
     <div style={{background:"#fff",borderRadius:"3px",padding:"28px",width:"100%",maxWidth:width,maxHeight:"92vh",overflowY:"auto"}}>
       <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"20px"}}>
         <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:"17px",fontWeight:"700"}}>{title}</h2>
         <button onClick={onClose} style={{background:"none",border:"none",fontSize:"22px",cursor:"pointer",color:"#aaa",lineHeight:1,marginLeft:"16px",fontFamily:"serif"}}>×</button>
       </div>
       {children}
     </div>
   </div>);
 }
 
 function Btn({children,onClick,variant="solid",size="md",style:sx={},disabled=false}){
   const base={cursor:disabled?"not-allowed":"pointer",letterSpacing:"1px",textTransform:"uppercase",borderRadius:"2px",fontFamily:"'IBM Plex Mono',monospace",transition:"opacity 0.1s",opacity:disabled?0.4:1};
   const sz={sm:{padding:"4px 12px",fontSize:"10px"},md:{padding:"7px 18px",fontSize:"11px"}};
   const v={solid:{background:"#0a0a0a",color:"#fff",border:"none"},outline:{background:"none",color:"#0a0a0a",border:"1px solid #0a0a0a"},ghost:{background:"none",color:"#777",border:"1px solid #ccc"},danger:{background:"#b52a2a",color:"#fff",border:"none"},wa:{background:"#128C7E",color:"#fff",border:"none"},gmail:{background:"#c71610",color:"#fff",border:"none"}};
   return <button onClick={disabled?undefined:onClick} style={{...base,...sz[size],...v[variant],...sx}}>{children}</button>;
 }
 
 function Field({label,children}){
   return(<div style={{marginBottom:"13px"}}>
     <label style={{fontSize:"9px",letterSpacing:"1.5px",textTransform:"uppercase",color:"#666",marginBottom:"5px",display:"block",fontWeight:"600"}}>{label}</label>
     {children}
   </div>);
 }
 
 function TI({value,onChange,placeholder,type="text"}){return <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={inp}/>;}
 function TS({value,onChange,children}){return <select value={value} onChange={e=>onChange(e.target.value)} style={inp}>{children}</select>;}
 function Empty({msg}){return <div style={{textAlign:"center",color:"#bbb",fontSize:"12px",padding:"56px 0",letterSpacing:"1px"}}>{msg}</div>;}
 function Alert({children}){return <div style={{background:"#fffbf0",border:"1px solid #f0e08a",borderLeft:"3px solid #c9a32a",padding:"8px 12px",borderRadius:"2px",fontSize:"11px",color:"#666",marginBottom:"8px"}}>{children}</div>;}
 function Spin(){return <span style={{display:"inline-block",width:"12px",height:"12px",border:"2px solid #fff",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.6s linear infinite",verticalAlign:"middle",marginRight:"6px"}}/>;}
 
 // Main
 export default function TzaddyPM(){
   const [nav,setNav]=useState("dash");
   const [clients,setClients]=useState([]);
   const [engagements,setEngagements]=useState([]);
   const [payments,setPayments]=useState([]);
   const [ready,setReady]=useState(false);
 
   useEffect(()=>{(async()=>{
     const [c,e,p]=await Promise.all([db.get("tz_c",[]),db.get("tz_e",[]),db.get("tz_p",[])]);
     setClients(c);setEngagements(e);setPayments(p);setReady(true);
   })();},[]);
 
   useEffect(()=>{if(ready)db.set("tz_c",clients);},[clients,ready]);
   useEffect(()=>{if(ready)db.set("tz_e",engagements);},[engagements,ready]);
   useEffect(()=>{if(ready)db.set("tz_p",payments);},[payments,ready]);
 
   const addClient=c=>setClients(p=>[...p,{id:uid(),createdAt:Date.now(),...c}]);
   const delClient=id=>setClients(p=>p.filter(c=>c.id!==id));
   const addEng=e=>setEngagements(p=>[...p,{id:uid(),createdAt:Date.now(),...e}]);
   const updEng=(id,patch)=>setEngagements(p=>p.map(e=>e.id===id?{...e,...patch}:e));
   const delEng=id=>setEngagements(p=>p.filter(e=>e.id!==id));
   const addPay=pay=>setPayments(p=>[...p,{id:uid(),createdAt:Date.now(),...pay}]);
 
   if(!ready)return(<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"monospace",fontSize:"12px",color:"#888",background:"#f5f4f0"}}>Loading…</div>);
 
   const ctx={clients,engagements,payments,addClient,delClient,addEng,updEng,delEng,addPay};
   const TABS=[["dash","Dashboard"],["clients","Clients"],["pipeline","Pipeline"],["payments","Payments"],["jobs","Jobs"],["reports","Reports"]];
 
   return(<>
     <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');@keyframes spin{to{transform:rotate(360deg)}}*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-thumb{background:#c8c4bc;border-radius:3px}input:focus,select:focus,textarea:focus{outline:2px solid #0a0a0a;outline-offset:-1px}.nb:hover{color:#fff!important;border-color:#666!important}.rh:hover{background:#fafaf7!important}.tbtn:hover{opacity:.82}.ck:hover{background:#fafaf8}.sb:hover{opacity:.88}`}</style>
     <div style={{fontFamily:"'IBM Plex Mono',monospace",background:"#f5f4f0",minHeight:"100vh",color:"#0a0a0a"}}>
       <header style={{background:"#0a0a0a",color:"#fff",padding:"0 28px",display:"flex",alignItems:"center",justifyContent:"space-between",height:"54px",position:"sticky",top:0,zIndex:100}}>
         <div style={{display:"flex",alignItems:"baseline",gap:"10px"}}>
           <span style={{fontFamily:"'Playfair Display',serif",fontSize:"17px",letterSpacing:"5px",fontWeight:"700"}}>TZADDY</span>
           <span style={{fontSize:"9px",letterSpacing:"2px",color:"#555",textTransform:"uppercase"}}>Practice Manager</span>
         </div>
         <nav style={{display:"flex",gap:"2px"}}>
           {TABS.map(([id,label])=>(
             <button key={id} className="nb" onClick={()=>setNav(id)}
               style={{background:"none",border:"1px solid",borderColor:nav===id?"#555":"transparent",color:nav===id?"#fff":"#666",padding:"5px 14px",fontSize:"10px",letterSpacing:"1.5px",cursor:"pointer",textTransform:"uppercase",transition:"all 0.1s",fontFamily:"'IBM Plex Mono',monospace"}}>
               {label}
             </button>
           ))}
         </nav>
       </header>
       <main style={{padding:"24px",maxWidth:"1080px",margin:"0 auto"}}>
         {nav==="dash"&&<Dash {...ctx}/>}
         {nav==="clients"&&<Clients {...ctx}/>}
         {nav==="pipeline"&&<Pipeline {...ctx}/>}
         {nav==="payments"&&<Payments {...ctx}/>}
         {nav==="jobs"&&<Jobs {...ctx}/>}
         {nav==="reports"&&<Reports {...ctx}/>}
       </main>
     </div>
   </>);
 }
 
 // Dashboard
 function Dash({clients,engagements,payments}){
   const tI=sum(engagements.map(e=>e.totalFee));
   const tR=sum(payments.map(p=>p.amount));
   const tW=sum(payments.map(p=>p.myPortion));
   const sc=STAGES.reduce((a,s)=>({...a,[s]:engagements.filter(e=>e.stage===s).length}),{});
   const action=engagements.filter(e=>e.stage!=="Delivered"&&e.stage!=="In Discussion");
   return(<div>
     <PageTitle>Dashboard</PageTitle>
     <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"12px",marginBottom:"22px"}}>
       {[["Clients",clients.length,null],["Invoiced",N(tI),"raised"],["Received",N(tR),"in"],["Warehoused",N(tW),"your portion"]].map(([l,v,s])=>(
         <div key={l} style={{background:"#fff",border:"1px solid #e0ddd5",borderRadius:"3px",padding:"18px 20px"}}>
           <div style={{fontSize:"9px",letterSpacing:"2px",textTransform:"uppercase",color:"#999",marginBottom:"8px"}}>{l}</div>
           <div style={{fontFamily:"'Playfair Display',serif",fontSize:"22px",fontWeight:"700",marginBottom:"2px"}}>{v}</div>
           {s&&<div style={{fontSize:"10px",color:"#bbb"}}>{s}</div>}
         </div>
       ))}
     </div>
     <div style={{display:"grid",gridTemplateColumns:"1fr 1.5fr",gap:"14px"}}>
       <div style={{background:"#fff",border:"1px solid #e0ddd5",borderRadius:"3px",padding:"20px"}}>
         <div style={{fontSize:"10px",letterSpacing:"1.5px",textTransform:"uppercase",color:"#666",marginBottom:"14px",fontWeight:"600"}}>Pipeline</div>
         {STAGES.map(s=>(
           <div key={s} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"9px"}}>
             <Badge stage={s}/><span style={{fontFamily:"'Playfair Display',serif",fontSize:"18px",fontWeight:"700",color:sc[s]>0?"#0a0a0a":"#ccc"}}>{sc[s]}</span>
           </div>
         ))}
       </div>
       <div style={{background:"#fff",border:"1px solid #e0ddd5",borderRadius:"3px",padding:"20px"}}>
         <div style={{fontSize:"10px",letterSpacing:"1.5px",textTransform:"uppercase",color:"#666",marginBottom:"14px",fontWeight:"600"}}>Action Required ({action.length})</div>
         {action.length===0?<div style={{color:"#bbb",fontSize:"12px",textAlign:"center",padding:"20px 0"}}>All clear.</div>
           :action.map(e=>{const c=clients.find(x=>x.id===e.clientId);return(<Alert key={e.id}><div style={{fontWeight:"600",marginBottom:"2px",fontSize:"12px"}}>{c?.name||"Unknown"}{c?.business?` — ${c.business}`:""}</div><div>{STAGE_PROMPT[e.stage]}</div></Alert>);})}
       </div>
     </div>
   </div>);
 }
 
 // Clients
 function Clients({clients,engagements,addClient,delClient}){
   const [show,setShow]=useState(false);
   const [f,setF]=useState({name:"",business:"",phone:"",email:""});
   const fk=k=>v=>setF(p=>({...p,[k]:v}));
   const save=()=>{if(!f.name.trim())return alert("Name required.");addClient({...f});setF({name:"",business:"",phone:"",email:""});setShow(false);};
   return(<div>
     <PageTitle actions={[<Btn key="a" onClick={()=>setShow(true)}>+ New Client</Btn>]}>Clients</PageTitle>
     {clients.length===0?<Empty msg="No clients yet."/>:(
       <div style={{background:"#fff",border:"1px solid #e0ddd5",borderRadius:"3px",overflow:"hidden"}}>
         <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px"}}>
           <thead><tr style={{background:"#fafaf7"}}>{["Name","Business","Phone","Email","Engagements","Added","Actions"].map(h=>(
             <th key={h} style={{textAlign:"left",padding:"10px 14px",fontSize:"9px",letterSpacing:"1.5px",textTransform:"uppercase",color:"#999",borderBottom:"1px solid #e0ddd5",fontWeight:"600"}}>{h}</th>
           ))}</tr></thead>
           <tbody>{clients.map(c=>(
             <tr key={c.id} className="rh">
               <td style={{padding:"10px 14px",borderBottom:"1px solid #f0ede5",fontWeight:"600"}}>{c.name}</td>
               <td style={{padding:"10px 14px",borderBottom:"1px solid #f0ede5",color:"#666"}}>{c.business||"—"}</td>
               <td style={{padding:"10px 14px",borderBottom:"1px solid #f0ede5",color:"#666"}}>{c.phone||"—"}</td>
               <td style={{padding:"10px 14px",borderBottom:"1px solid #f0ede5",color:"#666"}}>{c.email||"—"}</td>
               <td style={{padding:"10px 14px",borderBottom:"1px solid #f0ede5",fontWeight:"600"}}>{engagements.filter(e=>e.clientId===c.id).length}</td>
               <td style={{padding:"10px 14px",borderBottom:"1px solid #f0ede5",color:"#aaa"}}>{dt(c.createdAt)}</td>
               <td style={{padding:"10px 14px",borderBottom:"1px solid #f0ede5"}}><div style={{display:"flex",gap:"5px"}}>
                 <Btn variant="wa" size="sm" onClick={()=>openWA(c.phone,`Hello ${c.name.split(" ")[0]}, this is Elizabeth from Tzaddy Consulting. How can I assist you today?`)}>WA</Btn>
                 <Btn variant="danger" size="sm" onClick={()=>{if(window.confirm(`Delete ${c.name}?`))delClient(c.id);}}>Del</Btn>
               </div></td>
             </tr>
           ))}</tbody>
         </table>
       </div>
     )}
     {show&&(<Modal title="Add Client" onClose={()=>setShow(false)}>
       <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"14px"}}>
         <Field label="Name *"><TI value={f.name} onChange={fk("name")} placeholder="Full name"/></Field>
         <Field label="Business"><TI value={f.business} onChange={fk("business")} placeholder="Company"/></Field>
         <Field label="Phone"><TI value={f.phone} onChange={fk("phone")} placeholder="0801..."/></Field>
         <Field label="Email"><TI value={f.email} onChange={fk("email")} placeholder="email@..."/></Field>
       </div>
       <div style={{display:"flex",gap:"8px",marginTop:"20px"}}><Btn onClick={save}>Save</Btn><Btn variant="ghost" onClick={()=>setShow(false)}>Cancel</Btn></div>
     </Modal>)}
   </div>);
 }
 
 // Pipeline
 function Pipeline({clients,engagements,payments,addClient,addEng,updEng,delEng}){
   const [sf,setSf]=useState("All");
   const [showNew,setShowNew]=useState(false);
   const [showLog,setShowLog]=useState(false);
   const [exp,setExp]=useState(null);
   const [eMod,setEMod]=useState(null);
   const fil=sf==="All"?engagements:engagements.filter(e=>e.stage===sf);
   return(<div>
     <PageTitle actions={[<Btn key="l" variant="ghost" onClick={()=>setShowLog(true)}>💬 Log Conversation</Btn>,<Btn key="n" onClick={()=>setShowNew(true)}>+ New Engagement</Btn>]}>Pipeline</PageTitle>
     <div style={{display:"flex",gap:"5px",flexWrap:"wrap",marginBottom:"20px"}}>
       {["All",...STAGES].map(s=>(
         <button key={s} onClick={()=>setSf(s)} style={{background:sf===s?"#0a0a0a":"#fff",color:sf===s?"#fff":"#666",border:"1px solid",borderColor:sf===s?"#0a0a0a":"#ddd",padding:"4px 12px",fontSize:"10px",letterSpacing:"1px",cursor:"pointer",borderRadius:"2px",fontFamily:"'IBM Plex Mono',monospace"}}>{s}</button>
       ))}
     </div>
     {fil.length===0?<Empty msg="No engagements in this stage."/>:fil.map(e=>{
       const cl=clients.find(c=>c.id===e.clientId);
       const isO=exp===e.id;
       const ep=payments.filter(p=>p.engagementId===e.id);
       return(<div key={e.id} style={{background:"#fff",border:"1px solid #e0ddd5",borderRadius:"3px",marginBottom:"8px"}}>
         <div onClick={()=>setExp(isO?null:e.id)} style={{padding:"14px 18px",display:"flex",alignItems:"flex-start",justifyContent:"space-between",cursor:"pointer"}}>
           <div style={{flex:1,minWidth:0}}>
             <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"5px"}}>
               <span style={{fontWeight:"600",fontSize:"13px"}}>{cl?.name||"Unknown"}</span>
               {cl?.business&&<span style={{fontSize:"11px",color:"#888"}}>— {cl.business}</span>}
             </div>
             <div style={{display:"flex",gap:"5px",flexWrap:"wrap",marginBottom:"5px"}}>
               {(e.services||[]).map(s=><span key={s} style={{background:"#f0ede5",padding:"2px 7px",borderRadius:"2px",fontSize:"10px",color:"#666"}}>{s}</span>)}
             </div>
             <div style={{display:"flex",gap:"18px",fontSize:"11px",color:"#888"}}>
               <span>Total: <strong style={{color:"#0a0a0a"}}>{N(e.totalFee)}</strong></span>
               <span>My Fee: <strong style={{color:"#0a0a0a"}}>{N(e.myFee)}</strong></span>
               <span>{dt(e.createdAt)}</span>
             </div>
           </div>
           <div style={{display:"flex",alignItems:"center",gap:"8px",marginLeft:"14px",flexShrink:0}}>
             <Badge stage={e.stage}/><span style={{color:"#bbb",fontSize:"12px"}}>{isO?"▲":"▼"}</span>
           </div>
         </div>
         {isO&&(<div style={{borderTop:"1px solid #f0ede5",padding:"16px 18px",background:"#fafaf7"}}>
           <Alert>{STAGE_PROMPT[e.stage]}</Alert>
           {(e.feeItems||[]).length>0&&(<div style={{marginBottom:"14px"}}>
             <div style={{fontSize:"9px",letterSpacing:"1.5px",textTransform:"uppercase",color:"#999",marginBottom:"8px"}}>Fee Breakdown</div>
             {e.feeItems.map((fi,i)=>(
               <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #eee",fontSize:"12px"}}>
                 <span style={{color:"#555"}}>{fi.service}</span><span style={{fontWeight:"600"}}>{N(fi.fee)}</span>
               </div>
             ))}
             <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",fontSize:"12px",fontWeight:"600"}}><span>Total</span><span>{N(e.totalFee)}</span></div>
           </div>)}
           <div style={{display:"flex",gap:"10px",alignItems:"flex-end",marginBottom:"14px"}}>
             <div>
               <label style={{fontSize:"9px",letterSpacing:"1.5px",textTransform:"uppercase",color:"#666",marginBottom:"4px",display:"block"}}>My Portion (N)</label>
               <input type="number" defaultValue={e.myFee||0} onBlur={ev=>updEng(e.id,{myFee:Number(ev.target.value)})} style={{...inp,width:"160px"}}/>
             </div>
             <div style={{fontSize:"10px",color:"#aaa",paddingBottom:"8px"}}>← click elsewhere to save</div>
           </div>
           {e.notes&&<div style={{fontSize:"11px",color:"#666",marginBottom:"12px",fontStyle:"italic"}}>Notes: {e.notes}</div>}
           <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
             {STAGE_NEXT[e.stage]&&<Btn size="sm" onClick={()=>updEng(e.id,{stage:STAGE_NEXT[e.stage]})}>→ {STAGE_NEXT[e.stage]}</Btn>}
             <Btn variant="outline" size="sm" onClick={()=>printDoc(`Proposal — ${cl?.name}`,buildProposal(cl||{name:"Client"},e),"Engagement Proposal")}>PDF Proposal</Btn>
             <Btn variant="outline" size="sm" onClick={()=>printDoc(`Invoice — ${cl?.name}`,buildInvoice(cl||{name:"Client"},e,ep),"Invoice")}>PDF Invoice</Btn>
             {cl?.email&&<Btn variant="gmail" size="sm" onClick={()=>setEMod({eng:e,cl,type:"proposal",pays:ep})}>Email Proposal</Btn>}
             {cl?.phone&&<Btn variant="wa" size="sm" onClick={()=>openWA(cl.phone,waProposal(cl,e))}>WhatsApp</Btn>}
             <Btn variant="danger" size="sm" onClick={()=>{if(window.confirm("Delete?"))delEng(e.id);}}>Del</Btn>
           </div>
         </div>)}
       </div>);
     })}
     {showNew&&<NewEngModal clients={clients} addClient={addClient} addEng={addEng} onClose={()=>setShowNew(false)}/>}
     {showLog&&<LogModal clients={clients} addClient={addClient} addEng={addEng} onClose={()=>setShowLog(false)}/>}
     {eMod&&<GmailModal eng={eMod.eng} cl={eMod.cl} type={eMod.type} pays={eMod.pays} onClose={()=>setEMod(null)}/>}
   </div>);
 }
 
 // Log Conversation Modal
 function LogModal({clients,addClient,addEng,onClose}){
   const [text,setText]=useState("");
   const [loading,setLoading]=useState(false);
   const [parsed,setParsed]=useState(null);
   const [err,setErr]=useState("");
   const [services,setServices]=useState([]);
   const [notes,setNotes]=useState("");
   const [feeItems,setFeeItems]=useState([]);
   const [myFee,setMyFee]=useState("");
   const [cMode,setCMode]=useState("new");
   const [selId,setSelId]=useState("");
   const [nc,setNc]=useState({name:"",business:"",phone:"",email:""});
 
   const extract=async()=>{
     if(!text.trim())return alert("Paste a conversation.");
     setLoading(true);setErr("");
     try{
       const r=await parseConversation(text);
       setParsed(r);
       setNc({name:r.client_name||"",business:r.business_name||"",phone:r.phone||"",email:r.email||""});
       const sv=(r.services||[]).filter(s=>SERVICES.includes(s));
       setServices(sv);setNotes(r.notes||"");
       setFeeItems(sv.map(s=>({service:s,fee:0})));
       if(r.estimated_fee>0)setMyFee(String(r.estimated_fee));
     }catch{setErr("Extraction failed. Check connection and try again.");}
     setLoading(false);
   };
 
   const tog=s=>{const n=services.includes(s)?services.filter(x=>x!==s):[...services,s];setServices(n);setFeeItems(n.map(sv=>feeItems.find(f=>f.service===sv)||{service:sv,fee:0}));};
   const sf=(i,v)=>setFeeItems(p=>p.map((f,j)=>j===i?{...f,fee:Number(v)}:f));
   const tot=sum(feeItems.map(f=>f.fee));
 
   const create=()=>{
     let cid=selId;
     if(cMode==="new"){if(!nc.name.trim())return alert("Enter client name.");const id=uid();addClient({...nc,id});cid=id;}
     if(!cid)return alert("Select a client.");
     addEng({clientId:cid,services,feeItems,totalFee:tot,myFee:Number(myFee)||0,notes,stage:"In Discussion",tasks:services.flatMap(s=>(SERVICE_TASKS[s]||[]).map(t=>({id:uid(),text:t,done:false})))});
     onClose();
   };
 
   return(<Modal title="Log from Conversation" onClose={onClose} width={680}>
     <div style={{fontSize:"11px",color:"#777",marginBottom:"12px"}}>Paste a WhatsApp thread or email. AI will extract client details and services discussed.</div>
     {!parsed?(
       <div>
         <Field label="Paste Conversation">
           <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Paste your conversation here…" style={{...inp,minHeight:"160px",resize:"vertical"}}/>
         </Field>
         {err&&<div style={{fontSize:"11px",color:"#b52a2a",marginBottom:"12px"}}>{err}</div>}
         <div style={{display:"flex",gap:"8px"}}>
           <Btn onClick={extract} disabled={loading}>{loading&&<Spin/>}Extract Details</Btn>
           <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
         </div>
       </div>
     ):(
       <div>
         <div style={{background:"#edfaee",border:"1px solid #81c784",padding:"10px 14px",borderRadius:"2px",fontSize:"11px",marginBottom:"18px",color:"#2e7d32",fontWeight:"600"}}>✓ Extracted — review and confirm below.</div>
         <div style={{marginBottom:"16px"}}>
           <div style={{fontSize:"9px",letterSpacing:"1.5px",textTransform:"uppercase",color:"#666",marginBottom:"10px",fontWeight:"600"}}>Client</div>
           <div style={{display:"flex",gap:"8px",marginBottom:"12px"}}>
             {["new","existing"].map(m=>(
               <button key={m} onClick={()=>setCMode(m)} style={{flex:1,padding:"8px",border:"1px solid",borderColor:cMode===m?"#0a0a0a":"#ddd",background:cMode===m?"#0a0a0a":"#fff",color:cMode===m?"#fff":"#666",fontSize:"11px",letterSpacing:"1px",cursor:"pointer",textTransform:"uppercase",borderRadius:"2px",fontFamily:"'IBM Plex Mono',monospace"}}>{m==="new"?"Create New":"Existing"}</button>
             ))}
           </div>
           {cMode==="existing"?(<TS value={selId} onChange={setSelId}><option value="">— Choose —</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}{c.business?` — ${c.business}`:""}</option>)}</TS>):(
             <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
               <Field label="Name *"><TI value={nc.name} onChange={v=>setNc(p=>({...p,name:v}))} placeholder="Contact name"/></Field>
               <Field label="Business"><TI value={nc.business} onChange={v=>setNc(p=>({...p,business:v}))} placeholder="Company"/></Field>
               <Field label="Phone"><TI value={nc.phone} onChange={v=>setNc(p=>({...p,phone:v}))} placeholder="0801..."/></Field>
               <Field label="Email"><TI value={nc.email} onChange={v=>setNc(p=>({...p,email:v}))} placeholder="email@..."/></Field>
             </div>
           )}
         </div>
         <div style={{marginBottom:"16px"}}>
           <div style={{fontSize:"9px",letterSpacing:"1.5px",textTransform:"uppercase",color:"#666",marginBottom:"10px",fontWeight:"600"}}>Services (confirm or adjust)</div>
           <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px"}}>
             {SERVICES.map(s=>(
               <button key={s} className="sb" onClick={()=>tog(s)} style={{textAlign:"left",padding:"9px 12px",border:"1px solid",borderColor:services.includes(s)?"#0a0a0a":"#ddd",background:services.includes(s)?"#0a0a0a":"#fff",color:services.includes(s)?"#fff":"#444",borderRadius:"2px",cursor:"pointer",fontSize:"11px",fontFamily:"'IBM Plex Mono',monospace"}}>
                 {services.includes(s)?"✓ ":""}{s}
               </button>
             ))}
           </div>
         </div>
         {feeItems.length>0&&(<div style={{marginBottom:"14px"}}>
           <div style={{fontSize:"9px",letterSpacing:"1.5px",textTransform:"uppercase",color:"#666",marginBottom:"10px",fontWeight:"600"}}>Fees (N)</div>
           {feeItems.map((fi,i)=>(
             <div key={i} style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"7px"}}>
               <span style={{flex:1,fontSize:"12px"}}>{fi.service}</span>
               <input type="number" value={fi.fee||""} onChange={e=>sf(i,e.target.value)} placeholder="0" style={{...inp,width:"130px"}}/>
             </div>
           ))}
           <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderTop:"1px solid #ddd",fontWeight:"600",fontSize:"12px"}}><span>Total</span><span>{N(tot)}</span></div>
         </div>)}
         <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"14px",marginBottom:"16px"}}>
           <Field label="My Professional Fee (N)"><TI type="number" value={myFee} onChange={setMyFee} placeholder="Your portion"/></Field>
           <Field label="Notes"><TI value={notes} onChange={setNotes} placeholder="Scope notes"/></Field>
         </div>
         <div style={{display:"flex",gap:"8px"}}>
           <Btn onClick={create}>Create Engagement</Btn>
           <Btn variant="ghost" onClick={()=>setParsed(null)}>Re-parse</Btn>
           <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
         </div>
       </div>
     )}
   </Modal>);
 }
 
 // Gmail Modal
 function GmailModal({eng,cl,type,pays,onClose}){
   const defSub=type==="invoice"?`Invoice - Tzaddy Consulting - ${cl.business||cl.name}`:`Engagement Proposal — Tzaddy Consulting`;
   const defBody=type==="invoice"?buildInvoice(cl,eng,pays||[]):buildProposal(cl,eng);
   const [to,setTo]=useState(cl.email||"");
   const [sub,setSub]=useState(defSub);
   const [body,setBody]=useState(defBody);
   const [loading,setLoading]=useState(false);
   const [res,setRes]=useState(null);
 
   const send=async()=>{
     if(!to)return alert("Enter email address.");
     setLoading(true);
     try{
       const d=await sendViaGmail(to,sub,body);
       const ok=d.content?.some(b=>b.type==="text"||b.type==="mcp_tool_result"||b.type==="tool_result");
       setRes(ok?"sent":"error");
     }catch{setRes("error");}
     setLoading(false);
   };
 
   if(res==="sent")return(<Modal title="Sent" onClose={onClose}>
     <div style={{background:"#edfaee",border:"1px solid #81c784",padding:"18px 20px",borderRadius:"2px",textAlign:"center",marginBottom:"20px"}}>
       <div style={{fontFamily:"'Playfair Display',serif",fontSize:"18px",marginBottom:"4px"}}>✓ Email Sent</div>
       <div style={{fontSize:"12px",color:"#555"}}>Delivered to {to} via Gmail.</div>
     </div>
     <Btn onClick={onClose}>Close</Btn>
   </Modal>);
 
   return(<Modal title={type==="invoice"?"Send Invoice by Email":"Send Proposal by Email"} onClose={onClose} width={640}>
     <div style={{background:"#fafaf7",border:"1px solid #eee",borderRadius:"2px",padding:"10px 14px",marginBottom:"16px",fontSize:"12px"}}>
       <strong>{cl.name}</strong>{cl.business&&` — ${cl.business}`}
     </div>
     <Field label="To"><TI value={to} onChange={setTo} placeholder="client@email.com"/></Field>
     <Field label="Subject"><TI value={sub} onChange={setSub}/></Field>
     <Field label="Body"><textarea value={body} onChange={e=>setBody(e.target.value)} style={{...inp,minHeight:"240px",resize:"vertical",lineHeight:"1.7"}}/></Field>
     {res==="error"&&<div style={{fontSize:"11px",color:"#b52a2a",marginBottom:"12px"}}>Send failed. Ensure Gmail is connected in Settings → Connections.</div>}
     <div style={{display:"flex",gap:"8px"}}>
       <Btn variant="gmail" onClick={send} disabled={loading}>{loading&&<Spin/>}Send via Gmail</Btn>
       <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
     </div>
   </Modal>);
 }
 
 // New Engagement Modal
 function NewEngModal({clients,addClient,addEng,onClose}){
   const [step,setStep]=useState(1);
   const [cm,setCm]=useState("existing");
   const [sid,setSid]=useState(clients[0]?.id||"");
   const [nc,setNc]=useState({name:"",business:"",phone:"",email:""});
   const [svcs,setSvcs]=useState([]);
   const [notes,setNotes]=useState("");
   const [fi,setFi]=useState([]);
   const [mf,setMf]=useState("");
   const tog=s=>setSvcs(p=>p.includes(s)?p.filter(x=>x!==s):[...p,s]);
   const tot=sum(fi.map(f=>f.fee));
   const sfee=(i,v)=>setFi(p=>p.map((f,j)=>j===i?{...f,fee:Number(v)}:f));
 
   const create=()=>{
     let cid=sid;
     if(cm==="new"){if(!nc.name.trim())return alert("Enter name.");const id=uid();addClient({...nc,id});cid=id;}
     if(!cid)return alert("Select a client.");
     addEng({clientId:cid,services:svcs,feeItems:fi,totalFee:tot,myFee:Number(mf)||0,notes,stage:"In Discussion",tasks:svcs.flatMap(s=>(SERVICE_TASKS[s]||[]).map(t=>({id:uid(),text:t,done:false})))});
     onClose();
   };
 
   const sl=["Client","Services","Fees","Confirm"];
   return(<Modal title={"New Engagement — Step "${step}" of 4} "onClose={onClose} width{600}""}>
     <div style={{display:"flex",gap:"4px",marginBottom:"24px"}}>
       {sl.map((l,i)=>(
         <div key={l} style={{flex:1,textAlign:"center"}}>
           <div style={{height:"3px",background:step>i?"#0a0a0a":"#e0ddd5",borderRadius:"2px",marginBottom:"4px"}}></div>
           <span style={{fontSize:"9px",letterSpacing:"1px",textTransform:"uppercase",color:step>i?"#0a0a0a":"#bbb",fontWeight:step===i+1?"700":"400"}}>{l}</span>
         </div>
       ))}
     </div>
 
     {step===1&&(<div>
       <div style={{display:"flex",gap:"8px",marginBottom:"18px"}}>
         {["existing","new"].map(m=>(
           <button key={m} onClick={()=>setCm(m)} style={{flex:1,padding:"9px",border:"1px solid",borderColor:cm===m?"#0a0a0a":"#ddd",background:cm===m?"#0a0a0a":"#fff",color:cm===m?"#fff":"#666",fontSize:"11px",letterSpacing:"1px",cursor:"pointer",textTransform:"uppercase",borderRadius:"2px",fontFamily:"'IBM Plex Mono',monospace"}}>{m==="existing"?"Existing":"New Client"}</button>
         ))}
       </div>
       {cm==="existing"?(<Field label="Client"><TS value={sid} onChange={setSid}><option value="">— Choose —</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}{c.business?` — ${c.business}`:""}</option>)}</TS></Field>):(
         <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}}>
           <Field label="Name *"><TI value={nc.name} onChange={v=>setNc(p=>({...p,name:v}))} placeholder="Full name"/></Field>
           <Field label="Business"><TI value={nc.business} onChange={v=>setNc(p=>({...p,business:v}))} placeholder="Company"/></Field>
           <Field label="Phone"><TI value={nc.phone} onChange={v=>setNc(p=>({...p,phone:v}))} placeholder="0801..."/></Field>
           <Field label="Email"><TI value={nc.email} onChange={v=>setNc(p=>({...p,email:v}))} placeholder="email@..."/></Field>
         </div>
       )}
       <div style={{display:"flex",gap:"8px",marginTop:"20px"}}>
         <Btn onClick={()=>{if(cm==="existing"&&!sid)return alert("Select a client.");if(cm==="new"&&!nc.name.trim())return alert("Enter name.");setStep(2);}}>Next</Btn>
         <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
       </div>
     </div>)}
 
     {step===2&&(<div>
       <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"7px",marginBottom:"16px"}}>
         {SERVICES.map(s=>(
           <button key={s} className="sb" onClick={()=>tog(s)} style={{textAlign:"left",padding:"10px 12px",border:"1px solid",borderColor:svcs.includes(s)?"#0a0a0a":"#ddd",background:svcs.includes(s)?"#0a0a0a":"#fff",color:svcs.includes(s)?"#fff":"#444",borderRadius:"2px",cursor:"pointer",fontSize:"11px",fontFamily:"'IBM Plex Mono',monospace"}}>
             {svcs.includes(s)?"✓ ":""}{s}
           </button>
         ))}
       </div>
       <Field label="Notes"><textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Scope details…" style={{...inp,minHeight:"70px",resize:"vertical"}}/></Field>
       <div style={{display:"flex",gap:"8px",marginTop:"14px"}}>
         <Btn onClick={()=>{if(svcs.length===0)return alert("Select a service.");setFi(svcs.map(s=>({service:s,fee:0})));setStep(3);}}>Next</Btn>
         <Btn variant="ghost" onClick={()=>setStep(1)}>Back</Btn>
       </div>
     </div>)}
 
     {step===3&&(<div>
       {fi.map((f,i)=>(
         <div key={i} style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"8px",padding:"10px 12px",background:"#fafaf7",borderRadius:"2px",border:"1px solid #eee"}}>
           <span style={{flex:1,fontSize:"12px"}}>{f.service}</span>
           <input type="number" value={f.fee||""} onChange={e=>sfee(i,e.target.value)} placeholder="0" style={{...inp,width:"130px"}}/>
         </div>
       ))}
       <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderTop:"1px solid #ddd",marginBottom:"14px",fontWeight:"600",fontSize:"13px"}}><span>Grand Total</span><span>{N(tot)}</span></div>
       <Field label="My Professional Fee (N)"><input type="number" value={mf} onChange={e=>setMf(e.target.value)} placeholder="Your portion" style={inp}/></Field>
       <div style={{fontSize:"10px",color:"#aaa",marginTop:"-8px",marginBottom:"14px"}}>Client disbursements: {N(tot-(Number(mf)||0))}</div>
       <div style={{display:"flex",gap:"8px"}}><Btn onClick={()=>setStep(4)}>Review</Btn><Btn variant="ghost" onClick={()=>setStep(2)}>Back</Btn></div>
     </div>)}
 
     {step===4&&(<div>
       <div style={{background:"#fafaf7",border:"1px solid #e0ddd5",borderRadius:"3px",padding:"16px 18px",marginBottom:"18px"}}>
         <div style={{fontWeight:"600",fontSize:"14px",marginBottom:"10px"}}>{cm==="existing"?clients.find(c=>c.id===sid)?.name:nc.name}</div>
         <div style={{display:"flex",gap:"5px",flexWrap:"wrap",marginBottom:"14px"}}>{svcs.map(s=><span key={s} style={{background:"#e8e4dc",padding:"3px 8px",borderRadius:"2px",fontSize:"10px"}}>{s}</span>)}</div>
         <div style={{display:"flex",gap:"32px"}}>
           <div><div style={{fontSize:"9px",color:"#999",marginBottom:"2px",letterSpacing:"1px",textTransform:"uppercase"}}>Total</div><div style={{fontFamily:"'Playfair Display',serif",fontSize:"20px",fontWeight:"700"}}>{N(tot)}</div></div>
           <div><div style={{fontSize:"9px",color:"#999",marginBottom:"2px",letterSpacing:"1px",textTransform:"uppercase"}}>My Portion</div><div style={{fontFamily:"'Playfair Display',serif",fontSize:"20px",fontWeight:"700"}}>{N(Number(mf)||0)}</div></div>
         </div>
       </div>
       <div style={{display:"flex",gap:"8px"}}><Btn onClick={create}>Create Engagement</Btn><Btn variant="ghost" onClick={()=>setStep(3)}>Back</Btn></div>
     </div>)}
   </Modal>);
 }
 
 // Payments
 function Payments({clients,engagements,payments,addPay}){
   const [mod,setMod]=useState(null);
   const [em,setEm]=useState(null);
   const [f,setF]=useState({amount:"",myPortion:"",date:"",notes:""});
   const fk=k=>v=>setF(p=>({...p,[k]:v}));
   const payable=engagements.filter(e=>!["In Discussion","Delivered"].includes(e.stage));
   const tR=sum(payments.map(p=>p.amount));
   const tW=sum(payments.map(p=>p.myPortion));
 
   const rec=()=>{
     if(!f.amount)return alert("Enter amount.");
     addPay({engagementId:mod.id,clientId:mod.clientId,amount:Number(f.amount),myPortion:Number(f.myPortion)||0,date:f.date,notes:f.notes});
     setMod(null);
   };
 
   return(<div>
     <PageTitle>Payments</PageTitle>
     <div style={{display:"flex",gap:"28px",marginBottom:"20px",padding:"14px 18px",background:"#fff",border:"1px solid #e0ddd5",borderRadius:"3px"}}>
       {[["Received",N(tR)],["Warehoused",N(tW)],["Disbursements",N(tR-tW)]].map(([l,v])=>(
         <div key={l} style={{borderLeft:l!=="Received"?"1px solid #eee":"none",paddingLeft:l!=="Received"?"28px":"0"}}>
           <div style={{fontSize:"9px",letterSpacing:"1.5px",textTransform:"uppercase",color:"#999",display:"block",marginBottom:"3px"}}>{l}</div>
           <div style={{fontFamily:"'Playfair Display',serif",fontSize:"20px",fontWeight:"700"}}>{v}</div>
         </div>
       ))}
     </div>
 
     {payable.length===0?<Empty msg="No active engagements."/>:payable.map(e=>{
       const cl=clients.find(c=>c.id===e.clientId);
       const ep=payments.filter(p=>p.engagementId===e.id);
       const paid=sum(ep.map(p=>p.amount));
       const wh=sum(ep.map(p=>p.myPortion));
       const out=(e.totalFee||0)-paid;
       return(<div key={e.id} style={{background:"#fff",border:"1px solid #e0ddd5",borderRadius:"3px",marginBottom:"8px",padding:"16px 18px"}}>
         <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"10px"}}>
           <div>
             <div style={{fontWeight:"600",fontSize:"13px",marginBottom:"3px"}}>{cl?.name||"—"}{cl?.business&&<span style={{color:"#888",fontWeight:"400",fontSize:"12px"}}> — {cl.business}</span>}</div>
             <div style={{display:"flex",gap:"5px",flexWrap:"wrap"}}>{(e.services||[]).map(s=><span key={s} style={{background:"#f0ede5",padding:"2px 7px",borderRadius:"2px",fontSize:"10px",color:"#666"}}>{s}</span>)}</div>
           </div>
           <div style={{display:"flex",gap:"6px",alignItems:"center",flexShrink:0}}>
             <Badge stage={e.stage}/>
             <Btn size="sm" onClick={()=>{setMod(e);setF({amount:e.totalFee||"",myPortion:e.myFee||"",date:new Date().toISOString().slice(0,10),notes:""});}}>Record</Btn>
             <Btn variant="outline" size="sm" onClick={()=>printDoc(`Invoice — ${cl?.name}`,buildInvoice(cl||{name:"Client"},e,ep),"Invoice")}>PDF</Btn>
             {cl?.email&&<Btn variant="gmail" size="sm" onClick={()=>setEm({eng:e,cl,type:"invoice",pays:ep})}>Email</Btn>}
           </div>
         </div>
         <div style={{display:"flex",gap:"20px",fontSize:"11px",borderTop:"1px solid #f0ede5",paddingTop:"10px"}}>
           <span>Invoiced: <strong>{N(e.totalFee)}</strong></span>
           <span>Received: <strong style={{color:paid>=(e.totalFee||0)?"#2e7d32":"#c04400"}}>{N(paid)}</strong></span>
           <span>Outstanding: <strong style={{color:out>0?"#c04400":"#2e7d32"}}>{N(out)}</strong></span>
           <span>Warehoused: <strong style={{color:"#1a6ba0"}}>{N(wh)}</strong></span>
         </div>
         {ep.length>0&&(<div style={{marginTop:"10px",background:"#fafaf7",borderRadius:"2px",padding:"10px 12px"}}>
           {ep.map(p=>(
             <div key={p.id} style={{display:"flex",gap:"20px",fontSize:"11px",padding:"4px 0",borderBottom:"1px solid #eee"}}>
               <span style={{color:"#888"}}>{dt(p.date||p.createdAt)}</span>
               <span>Received: <strong>{N(p.amount)}</strong></span>
               <span>Warehoused: <strong style={{color:"#1a6ba0"}}>{N(p.myPortion)}</strong></span>
               {p.notes&&<span style={{color:"#aaa"}}>{p.notes}</span>}
             </div>
           ))}
         </div>)}
       </div>);
     })}
 
     {payments.length>0&&(<div style={{marginTop:"28px"}}>
       <div style={{fontSize:"10px",letterSpacing:"1.5px",textTransform:"uppercase",color:"#666",marginBottom:"12px",fontWeight:"600"}}>All Payment Records</div>
       <div style={{background:"#fff",border:"1px solid #e0ddd5",borderRadius:"3px",overflow:"hidden"}}>
         <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px"}}>
           <thead><tr style={{background:"#fafaf7"}}>{["Date","Client","Received","Warehoused","Disbursements","Notes"].map(h=>(
             <th key={h} style={{textAlign:"left",padding:"10px 14px",fontSize:"9px",letterSpacing:"1.5px",textTransform:"uppercase",color:"#999",borderBottom:"1px solid #e0ddd5",fontWeight:"600"}}>{h}</th>
           ))}</tr></thead>
           <tbody>{[...payments].reverse().map(p=>{
             const cl=clients.find(c=>c.id===p.clientId);
             return(<tr key={p.id} className="rh">
               <td style={{padding:"10px 14px",borderBottom:"1px solid #f0ede5"}}>{dt(p.date||p.createdAt)}</td>
               <td style={{padding:"10px 14px",borderBottom:"1px solid #f0ede5",fontWeight:"600"}}>{cl?.name||"—"}</td>
               <td style={{padding:"10px 14px",borderBottom:"1px solid #f0ede5"}}>{N(p.amount)}</td>
               <td style={{padding:"10px 14px",borderBottom:"1px solid #f0ede5",color:"#1a6ba0",fontWeight:"600"}}>{N(p.myPortion)}</td>
               <td style={{padding:"10px 14px",borderBottom:"1px solid #f0ede5",color:"#888"}}>{N(p.amount-p.myPortion)}</td>
               <td style={{padding:"10px 14px",borderBottom:"1px solid #f0ede5",color:"#aaa"}}>{p.notes||"—"}</td>
             </tr>);
           })}</tbody>
         </table>
       </div>
     </div>)}
 
     {mod&&(<Modal title="Record Payment" onClose={()=>setMod(null)}>
       <div style={{background:"#fafaf7",border:"1px solid #eee",borderRadius:"2px",padding:"12px 14px",marginBottom:"18px",fontSize:"12px"}}>
         <strong>{clients.find(c=>c.id===mod.clientId)?.name}</strong><span style={{color:"#888"}}> — Invoiced: {N(mod.totalFee)} | My Fee: {N(mod.myFee)}</span>
       </div>
       <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"14px"}}>
         <Field label="Amount Received (N) *"><TI type="number" value={f.amount} onChange={fk("amount")} placeholder="150000"/></Field>
         <Field label="My Portion to Warehouse (N)"><TI type="number" value={f.myPortion} onChange={fk("myPortion")} placeholder="80000"/></Field>
       </div>
       <Field label="Date"><TI type="date" value={f.date} onChange={fk("date")}/></Field>
       <Field label="Notes"><TI value={f.notes} onChange={fk("notes")} placeholder="e.g. Bank transfer — tranche 1"/></Field>
       <div style={{background:"#f0ede5",padding:"8px 12px",borderRadius:"2px",fontSize:"11px",marginBottom:"16px"}}>Client disbursements retained: {N(Number(f.amount||0)-Number(f.myPortion||0))}</div>
       <div style={{display:"flex",gap:"8px"}}><Btn onClick={rec}>Record Payment</Btn><Btn variant="ghost" onClick={()=>setMod(null)}>Cancel</Btn></div>
     </Modal>)}
     {em&&<GmailModal eng={em.eng} cl={em.cl} type={em.type} pays={em.pays} onClose={()=>setEm(null)}/>}
   </div>);
 }
 
 // Jobs
 function Jobs({clients,engagements,updEng}){
   const active=engagements.filter(e=>["In Progress","Deal Sealed","Awaiting Payment","Proposal Sent"].includes(e.stage));
   const tog=(eng,tid)=>{const t=(eng.tasks||[]).map(t=>t.id===tid?{...t,done:!t.done}:t);updEng(eng.id,{tasks:t});};
   return(<div>
     <PageTitle>Jobs & Deliverables</PageTitle>
     {active.length===0?<Empty msg="No active jobs."/>:active.map(e=>{
       const cl=clients.find(c=>c.id===e.clientId);
       const t=e.tasks||[];const done=t.filter(x=>x.done).length;
       const pct=t.length>0?Math.round((done/t.length)*100):0;
       const all=t.length>0&&done===t.length;
       return(<div key={e.id} style={{background:"#fff",border:"1px solid #e0ddd5",borderRadius:"3px",marginBottom:"14px",padding:"20px"}}>
         <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"12px"}}>
           <div>
             <div style={{fontWeight:"600",fontSize:"14px",marginBottom:"3px"}}>{cl?.name||"Unknown"}{cl?.business&&<span style={{color:"#888",fontWeight:"400",fontSize:"12px"}}> — {cl.business}</span>}</div>
             <div style={{display:"flex",gap:"5px",flexWrap:"wrap"}}>{(e.services||[]).map(s=><span key={s} style={{background:"#f0ede5",padding:"2px 7px",borderRadius:"2px",fontSize:"10px",color:"#666"}}>{s}</span>)}</div>
           </div>
           <div style={{display:"flex",gap:"10px",alignItems:"center",flexShrink:0}}>
             <Badge stage={e.stage}/><span style={{fontFamily:"'Playfair Display',serif",fontSize:"18px",fontWeight:"700",color:pct===100?"#2e7d32":"#0a0a0a"}}>{pct}%</span>
           </div>
         </div>
         <div style={{height:"4px",background:"#f0ede5",borderRadius:"2px",marginBottom:"16px",overflow:"hidden"}}>
           <div style={{height:"100%",width:`${pct}%`,background:pct===100?"#2e7d32":"#0a0a0a",borderRadius:"2px",transition:"width 0.3s"}}></div>
         </div>
         <div style={{marginBottom:"14px"}}>
           <div style={{fontSize:"9px",letterSpacing:"1.5px",textTransform:"uppercase",color:"#999",marginBottom:"8px"}}>{done} of {t.length} complete</div>
           {t.map(tk=>(
             <div key={tk.id} className="ck" onClick={()=>tog(e,tk.id)} style={{display:"flex",alignItems:"center",gap:"10px",padding:"7px 6px",borderBottom:"1px solid #f8f7f4",cursor:"pointer",borderRadius:"2px"}}>
               <div style={{width:"16px",height:"16px",border:"1.5px solid",borderColor:tk.done?"#2e7d32":"#ccc",borderRadius:"2px",background:tk.done?"#2e7d32":"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                 {tk.done&&<span style={{color:"#fff",fontSize:"10px",fontWeight:"700",lineHeight:1}}>✓</span>}
               </div>
               <span style={{fontSize:"12px",textDecoration:tk.done?"line-through":"none",color:tk.done?"#bbb":"#0a0a0a"}}>{tk.text}</span>
             </div>
           ))}
         </div>
         {all?(<div style={{background:"#edfaee",border:"1px solid #81c784",padding:"10px 14px",borderRadius:"2px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
           <span style={{fontSize:"12px",color:"#2e7d32",fontWeight:"600"}}>All tasks complete — ready to mark Delivered.</span>
           <Btn size="sm" onClick={()=>updEng(e.id,{stage:"Delivered"})}>Mark Delivered</Btn>
         </div>):<Alert>{STAGE_PROMPT[e.stage]}</Alert>}
       </div>);
     })}
   </div>);
 }
 
 // Reports
 function Reports({clients,engagements,payments}){
   const tI=sum(engagements.map(e=>e.totalFee));
   const tR=sum(payments.map(p=>p.amount));
   const tW=sum(payments.map(p=>p.myPortion));
   const cr=tI>0?Math.round((tR/tI)*100):0;
 
   const mMap={};
   payments.forEach(p=>{const k=mk(p.date||p.createdAt);if(!mMap[k])mMap[k]={month:k,received:0,warehoused:0};mMap[k].received+=p.amount;mMap[k].warehoused+=p.myPortion;});
   const mData=Object.values(mMap).slice(-12);
 
   const sMap={};
   engagements.forEach(e=>(e.feeItems||[]).forEach(f=>{if(!sMap[f.service])sMap[f.service]=0;sMap[f.service]+=f.fee;}));
   const sData=Object.entries(sMap).map(([name,value])=>({name:name.replace("Business Registration","CAC Reg.").replace("Tax Registration (TIN/VAT)","TIN/VAT Reg.").replace("Tax Filing & Compliance","Tax Filing").replace("Payments on Client's Behalf","Client Pmts").replace("Bookkeeping & Accounting","Bookkeeping").replace("Financial Statement Preparation","Fin. Statements").replace("Business Advisory / CFO","Advisory"),value})).sort((a,b)=>b.value-a.value);
 
   const clMap={};
   payments.forEach(p=>{const c=clients.find(x=>x.id===p.clientId);const n=c?.name?.split(" ")[0]||"Unknown";if(!clMap[n])clMap[n]=0;clMap[n]+=p.amount;});
   const clData=Object.entries(clMap).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value).slice(0,8);
 
   const pieD=[{name:"My Fee",value:tW},{name:"Disbursements",value:Math.max(0,tR-tW)}];
 
   const TT=({active,payload})=>{if(!active||!payload?.length)return null;return(<div style={{background:"#fff",border:"1px solid #e0ddd5",padding:"8px 12px",borderRadius:"2px",fontSize:"11px",fontFamily:"'IBM Plex Mono',monospace"}}><div style={{fontWeight:"600"}}>{payload[0].name||payload[0].payload?.name}</div><div>{N(payload[0].value)}</div></div>);};
 
   return(<div>  
     <PageTitle>Reports</PageTitle>
     <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"12px",marginBottom:"24px"}}>
       {[["Invoiced",N(tI)],["Received",N(tR)],["Warehoused",N(tW)],["Collection Rate",`${cr}%`]].map(([l,v])=>(
         <div key={l} style={{background:"#fff",border:"1px solid #e0ddd5",borderRadius:"3px",padding:"18px 20px"}}>
           <div style={{fontSize:"9px",letterSpacing:"2px",textTransform:"uppercase",color:"#999",marginBottom:"8px"}}>{l}</div>
           <div style={{fontFamily:"'Playfair Display',serif",fontSize:"22px",fontWeight:"700"}}>{v}</div>
         </div>
       ))}
     </div>
 
     {payments.length===0?<Empty msg="Record payments to see reports."/>:(<>
       <div style={{background:"#fff",border:"1px solid #e0ddd5",borderRadius:"3px",padding:"20px",marginBottom:"16px"}}>
         <div style={{fontSize:"10px",letterSpacing:"1.5px",textTransform:"uppercase",color:"#666",marginBottom:"18px",fontWeight:"600"}}>Monthly Cash Receipts</div>
         <ResponsiveContainer width="100%" height={200}>
           <BarChart data={mData} barGap={2}>
             <XAxis dataKey="month" tick={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",fill:"#999"}} axisLine={false} tickLine={false}/>
             <YAxis tick={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",fill:"#999"}} tickFormatter={v=>`N${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={55}/>
             <Tooltip content={<TT/>}/>
             <Bar dataKey="received" name="Received" fill="#0a0a0a" radius={[2,2,0,0]}/>
             <Bar dataKey="warehoused" name="Warehoused" fill="#bbb" radius={[2,2,0,0]}/>
           </BarChart>
         </ResponsiveContainer>
         <div style={{display:"flex",gap:"16px",fontSize:"10px",color:"#999",marginTop:"8px",justifyContent:"center"}}>
           <span><span style={{display:"inline-block",width:"10px",height:"10px",background:"#0a0a0a",borderRadius:"1px",marginRight:"5px",verticalAlign:"middle"}}></span>Received</span>
           <span><span style={{display:"inline-block",width:"10px",height:"10px",background:"#bbb",borderRadius:"1px",marginRight:"5px",verticalAlign:"middle"}}></span>Warehoused</span>
         </div>
       </div>

       <div style={{display:"grid",gridTemplateColumns:"1.4fr 1fr",gap:"16px",marginBottom:"16px"}}>
         <div style={{background:"#fff",border:"1px solid #e0ddd5",borderRadius:"3px",padding:"20px"}}>
           <div style={{fontSize:"10px",letterSpacing:"1.5px",textTransform:"uppercase",color:"#666",marginBottom:"18px",fontWeight:"600"}}>Fees by Service</div>
           {sData.length===0?<Empty msg="No data."/>:(
             <ResponsiveContainer width="100%" height={220}>
               <BarChart data={sData} layout="vertical" margin={{left:0,right:20}}>
                 <XAxis type="number" tick={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",fill:"#999"}} tickFormatter={v=>`N${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false}/>
                 <YAxis type="category" dataKey="name" tick={{fontSize:9,fontFamily:"'IBM Plex Mono',monospace",fill:"#666"}} axisLine={false} tickLine={false} width={90}/>
                 <Tooltip content={<TT/>}/>
                 <Bar dataKey="value" name="Fee" radius={[0,2,2,0]}>
                   {sData.map((_,i)=><Cell key={i} fill={["#0a0a0a","#444","#777","#aaa","#bbb","#ccc","#ddd","#eee"][i]||"#ccc"}/>)}
                 </Bar>
               </BarChart>
             </ResponsiveContainer>
           )}
         </div>
         <div style={{background:"#fff",border:"1px solid #e0ddd5",borderRadius:"3px",padding:"20px"}}>
           <div style={{fontSize:"10px",letterSpacing:"1.5px",textTransform:"uppercase",color:"#666",marginBottom:"18px",fontWeight:"600"}}>Fee Split</div>
           {tR===0?<Empty msg="No data."/>:(<>
             <ResponsiveContainer width="100%" height={160}>
               <PieChart>
                 <Pie data={pieD} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={3}>
                   {pieD.map((_,i)=><Cell key={i} fill={i===0?"#0a0a0a":"#bbb"}/>)}
                 </Pie>
                 <Tooltip content={<TT/>}/>
               </PieChart>
             </ResponsiveContainer>
             <div style={{fontSize:"10px",color:"#666",textAlign:"center"}}>
               {pieD.map((d,i)=>(
                 <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:"6px",marginBottom:"3px"}}>
                   <span style={{display:"inline-block",width:"10px",height:"10px",background:i===0?"#0a0a0a":"#bbb",borderRadius:"1px"}}></span>
                   <span>{d.name}: <strong>{N(d.value)}</strong></span>
                 </div>
               ))}
             </div>
           </>)}
         </div>
       </div>

       {clData.length>0&&(<div style={{background:"#fff",border:"1px solid #e0ddd5",borderRadius:"3px",padding:"20px"}}>
         <div style={{fontSize:"10px",letterSpacing:"1.5px",textTransform:"uppercase",color:"#666",marginBottom:"18px",fontWeight:"600"}}>Receipts by Client (Top 8)</div>
         <ResponsiveContainer width="100%" height={200}>
           <BarChart data={clData}>
             <XAxis dataKey="name" tick={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",fill:"#999"}} axisLine={false} tickLine={false}/>
             <YAxis tick={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",fill:"#999"}} tickFormatter={v=>`N${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={55}/>
             <Tooltip content={<TT/>}/>
             <Bar dataKey="value" name="Received" radius={[2,2,0,0]}>
               {clData.map((_,i)=><Cell key={i} fill={["#0a0a0a","#333","#555","#777","#888","#aaa","#bbb","#ccc"][i]||"#ccc"}/>)}
             </Bar>
           </BarChart>
         </ResponsiveContainer>
       </div>)}
     </>)}
   </div>);
 }
