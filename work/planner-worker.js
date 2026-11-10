let planner,revision;
self.onmessage=event=>{
 const {generation,bars,walking,metro,request,distanceRevision=0}=event.data;
 try{
  if(!planner||revision!==distanceRevision){planner=RoutePlanner.create(bars,walking,metro);revision=distanceRevision;}
  const plan=planner.plan(request);
  self.postMessage({generation,plan});
 }catch(error){self.postMessage({generation,error:error.message});}
};
