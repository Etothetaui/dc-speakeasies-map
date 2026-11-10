let planner;
self.onmessage=event=>{
 const {generation,bars,walking,request}=event.data;
 try{
  if(!planner)planner=RoutePlanner.create(bars,walking);
  const plan=planner.plan(request);
  self.postMessage({generation,plan});
 }catch(error){self.postMessage({generation,error:error.message});}
};
