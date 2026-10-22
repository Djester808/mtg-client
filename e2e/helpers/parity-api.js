const https=require('https'),assert=require('assert/strict');
function createParityApi(getToken){
 async function api(route,body,method=body?'POST':'GET'){
  for(let attempt=0;;attempt++){
   const response=await new Promise((resolve,reject)=>{const p=body?JSON.stringify(body):'',token=getToken();const request=https.request({hostname:'localhost',port:7001,path:'/api/'+route,method,rejectUnauthorized:false,agent:false,headers:{'Content-Type':'application/json',...(body?{'Content-Length':Buffer.byteLength(p)}:{}),...(token?{Authorization:'Bearer '+token}:{})}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>{let data;try{data=JSON.parse(text);}catch{data=text;}resolve({status:res.statusCode,data,retryAfter:Number(res.headers['retry-after'])});});});request.on('error',reject);request.end(p);});
   if(response.status!==429||attempt>=4)return response;
   const delay=Math.max(1000,Math.min(30000,response.retryAfter*1000||15000));console.log('Rate limit reached; waiting '+delay/1000+' seconds before retrying the disposable test request.');await new Promise(resolve=>setTimeout(resolve,delay));
  }
 }
 async function ok(...args){const result=await api(...args);assert(result.status<300,JSON.stringify({route:args[0],status:result.status}));return result.data;}
 return {api,ok};
}
module.exports={createParityApi};
