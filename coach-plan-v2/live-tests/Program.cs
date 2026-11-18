using System.Diagnostics;
using System.Text.Json;
using System.Net;
using System.Xml.Linq;
using SportHub.AI.Application.DTOs.Chat;
using SportHub.AI.Application.Interfaces;
using SportHub.AI.Application.Services.CoachPlanning;
using SportHub.AI.Infrastructure.Python;
using SportHub.BuildingBlocks.SharedKernel.Errors;

var options = new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true };
string Arg(string key, string fallback) { var i = Array.IndexOf(args,key); return i >= 0 && i+1 < args.Length ? args[i+1] : fallback; }
var root = Path.GetFullPath(Arg("--dir", "coach-plan-v2/live-tests"));
var cases = JsonSerializer.Deserialize<List<TestCase>>(File.ReadAllText(Path.Combine(root,"cases.json")), options)!;
var group = Arg("--group", "all"); var id = Arg("--id", "");
if (group is not ("all" or "happy" or "unhappy" or "local")) throw new ArgumentException("Invalid group");
var selected = cases.Where(c => (id=="" || c.Id==id) && (group=="all" || group=="happy" && c.Happy || group=="unhappy" && !c.Happy || group=="local" && c.Local)).Take(int.Parse(Arg("--max-cases","50"))).ToList();
if (selected.Count==0) throw new ArgumentException("No selected cases");
var endpoint = new Uri(Arg("--python-url","http://127.0.0.1:8001"));
if (!endpoint.IsLoopback || endpoint.Scheme!="http" || endpoint.AbsolutePath!="/" || endpoint.UserInfo!="") throw new ArgumentException("Only local Python service root URL allowed");
using var transport = new DiagnosticHandler(new HttpClientHandler { UseProxy=false, AllowAutoRedirect=false });
using var http = new HttpClient(transport) { BaseAddress=endpoint, Timeout=TimeSpan.FromSeconds(90) };
var factory = new LocalFactory(http);
var results = new List<Result>();
var cap = int.Parse(Arg("--max-calls","100")); if(cap<0 || cap>200) throw new ArgumentException("max-calls 0..200");
var budget = new Budget(cap);
var dir = Path.Combine(root,"reports",DateTime.UtcNow.ToString("yyyyMMdd-HHmmss-fff")); Directory.CreateDirectory(dir);
void Save() {
 File.WriteAllText(Path.Combine(dir,"results.json"),JsonSerializer.Serialize(results,options));
 var suite=new XElement("testsuite",new XAttribute("tests",results.Count),new XAttribute("failures",results.Count(x=>x.Status=="FAIL")),new XAttribute("skipped",results.Count(x=>x.Status is "INFRA_ERROR" or "NOT_RUN")));
 foreach(var r in results){ var x=new XElement("testcase",new XAttribute("name",r.Input.Id),new XAttribute("time",(r.ElapsedMs/1000.0).ToString(System.Globalization.CultureInfo.InvariantCulture))); if(r.Status=="FAIL")x.Add(new XElement("failure",r.Actual)); else if(r.Status!="PASS") x.Add(new XElement("skipped",r.Actual)); suite.Add(x); } suite.Save(Path.Combine(dir,"junit.xml"));
 string H(string? s)=>WebUtility.HtmlEncode(s??"");
 File.WriteAllText(Path.Combine(dir,"index.html"),"<!doctype html><meta charset=utf-8><title>Coach Plan V2.2</title><style>body{font:15px system-ui;max-width:1100px;margin:30px auto}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#eee;padding:12px}details{margin:12px;border:1px solid #ccc;padding:12px}</style><h1>Coach Plan V2.2 – LIVE</h1><p>"+H(string.Join(" / ",results.GroupBy(r=>r.Status).Select(g=>$"{g.Key} {g.Count()}")))+"</p>"+string.Join("",results.Select(r=>"<details><summary>"+H(r.Input.Id+" "+r.Status+" "+r.Input.Goal)+"</summary><pre>"+H(JsonSerializer.Serialize(r,options))+"</pre></details>")));
}
foreach(var c in selected){
 transport.Events.Clear();
 var trace = new TraceProvider(new PythonCoachPlanProvider(factory),budget); var watch=Stopwatch.StartNew(); string status, actual;
 try {
  var response=await new CoachPlanGenerator(trace).GenerateAsync(c.Sport,c.Goal,c.Level,c.Language);
  status=c.Happy && (trace.Calls.Count is >=1 and <=2) && CoachPlanOutputGuard.Valid(response.Answer)?"PASS":"FAIL";
  actual=response.Answer;
 } catch(LimitException){ status="NOT_RUN";actual="Configured provider-call budget reached"; }
 catch(AppException e){ actual=$"HTTP {e.StatusCode} [{e.ErrorCode}] {e.Message}";
  status=e.ErrorCode.StartsWith("ai_provider_") || e.ErrorCode.StartsWith("ai_service_") || e.ErrorCode=="ai_model_unavailable" ? "INFRA_ERROR" : !c.Happy && e.StatusCode==400 && e.ErrorCode==c.ExpectedCode && (!c.Local || trace.Calls.Count==0) ? "PASS":"FAIL";
 } catch(HttpRequestException e){status="INFRA_ERROR";actual=e.GetType().Name;}
 catch(Exception e){status="FAIL";actual=e.GetType().Name;}
 results.Add(new(c,status,actual,trace.Calls,watch.ElapsedMilliseconds,transport.Events.ToArray())); Save(); Console.WriteLine($"{c.Id} {status} ({trace.Calls.Count} provider calls)");
 // Stop live requests after rate limit, but continue independent local validation cases.
 if(status=="INFRA_ERROR" && actual.Contains("rate_limited")) budget.Remaining=0;
}
Console.WriteLine(Path.Combine(dir,"index.html"));
return results.All(x=>x.Status=="PASS")?0:results.Any(x=>x.Status=="FAIL")?1:2;
record TestCase(string Id,string Sport,string Level,string Goal,string Language,bool Happy,bool Local,string? ExpectedCode);
record Result(TestCase Input,string Status,string Actual,List<Call> Calls,long ElapsedMs,string[] Transport);
record Call(string Context,string Stage,string Question,string? Answer,string? Model,string? Error);
sealed class LocalFactory(HttpClient client):IHttpClientFactory {public HttpClient CreateClient(string name)=>client;}
sealed class Budget(int remaining){public int Remaining=remaining;}
sealed class LimitException:Exception {}
sealed class TraceProvider(IAiChatProvider inner,Budget budget):IAiChatProvider {
 public List<Call> Calls {get;}=[];
 public async Task<AiProviderResponse> AskAsync(string systemPrompt,string context,string question,string? previousInteractionId=null,CancellationToken cancellationToken=default){
  if(budget.Remaining<=0) throw new LimitException(); budget.Remaining--;
  string stage=Calls.Count==0?"generation":"generation_retry";
  try {var result=await inner.AskAsync(systemPrompt,context,question,previousInteractionId,cancellationToken); Calls.Add(new(context,stage,question,result.Answer,result.Model,null));return result;}
  catch(AppException e){Calls.Add(new(context,stage,question,null,null,e.ErrorCode));throw;}
 }
}

sealed class DiagnosticHandler(HttpMessageHandler inner):DelegatingHandler(inner) {
 public List<string> Events {get;}=[];
 protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken ct){
  try {var response=await base.SendAsync(request,ct); Events.Add($"{request.Method} {request.RequestUri?.AbsolutePath}: HTTP {(int)response.StatusCode}"); return response;}
  catch(HttpRequestException e){Events.Add($"Transport: {e.HttpRequestError}; {e.InnerException?.GetType().Name}"); throw;}
  catch(OperationCanceledException){Events.Add("Transport: canceled or timed out");throw;}
 }
}
