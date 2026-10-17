"use client";
import { useEffect, useRef, useState } from "react";
import type { SourceFile } from "@/contracts";
import { api } from "@/lib/client/api";
import "./search.css";
interface Match {type:"code"|"symbol";snapshotId:string;fileId:string;path:string;startLine:number;endLine:number;contentHash:string;preview:string;evidenceId:string;name?:string;kind?:string;runtime?:boolean}
interface SearchResult {snapshotId:string;commitSha:string;query:string;mode:string;matches:Match[];total:number;nextCursor:string|null;limitations:string[]}
export function CodeSearch({snapshotId,files,onEvidence}: {snapshotId:string;files:SourceFile[];onEvidence:(id:string,snapshotId?:string)=>void}) {
  const [query,setQuery]=useState("");const [mode,setMode]=useState("all");const [fileId,setFileId]=useState("");
  const [result,setResult]=useState<SearchResult|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const request=useRef(0);const controller=useRef<AbortController|null>(null);
  function invalidate(){request.current++;controller.current?.abort();setResult(null);setError("");setBusy(false);}
  useEffect(()=>()=>{request.current++;controller.current?.abort();},[snapshotId]);
  async function search(cursor?:string){
    if(query.trim().length<2)return;
    controller.current?.abort();controller.current=new AbortController();const number=++request.current;
    setBusy(true);setError("");if(!cursor)setResult(null);
    const parameters=new URLSearchParams({snapshotId,q:query.trim(),mode,limit:"10",...(fileId?{fileId}:{}),...(cursor?{cursor}:{})});
    try {
      const response=await api<SearchResult>("/api/search?"+parameters,{signal:controller.current.signal});
      if(number!==request.current)return;
      if(response.snapshotId!==snapshotId||response.query!==query.trim()||response.mode!==mode)throw new Error("Search results belong to another query or snapshot.");
      setResult(previous=>({...response,matches:cursor&&previous?[...previous.matches,...response.matches]:response.matches}));
    }catch(reason){if(number===request.current)setError((reason as Error).message);}
    finally{if(number===request.current)setBusy(false);}
  }
  return <section className="code-search" aria-label="Code and symbol search">
    <h3>Search code and symbols</h3><p>Search source text and indexed declarations. The filename filter is separate.</p>
    <form onSubmit={event=>{event.preventDefault();void search();}}>
      <label>Source query<input aria-label="Code or symbol query" value={query} maxLength={200} placeholder="e.g. setState" onChange={event=>{invalidate();setQuery(event.target.value);}} /></label>
      <label>Search in<select aria-label="Search mode" value={mode} onChange={event=>{invalidate();setMode(event.target.value);}}><option value="all">Code and symbols</option><option value="code">Code text</option><option value="symbol">Symbols</option></select></label>
      <label>File scope<select aria-label="Search file scope" value={fileId} onChange={event=>{invalidate();setFileId(event.target.value);}}><option value="">All source files</option>{files.map(file=><option key={file.fileId} value={file.fileId}>{file.path}</option>)}</select></label>
      <button type="submit" className="secondary-button" disabled={busy||query.trim().length<2}>{busy?"Searching…":"Search source"}</button>
    </form>
    {error&&<p role="alert">{error}</p>}
    {result&&<><p role="status">Showing {result.matches.length} of {result.total} matches</p><ol className="code-search-results">{result.matches.map((match,index)=><li key={match.evidenceId+":"+match.type+":"+index}>
      <button type="button" onClick={()=>onEvidence(match.evidenceId,match.snapshotId)}><strong>{match.type==="symbol"?match.name:"Source match"}</strong><small>{match.path} · lines {match.startLine}–{match.endLine}</small><span>{match.type}{match.kind?" · "+match.kind:""}</span><code>{match.preview}</code></button>
    </li>)}</ol>{!result.total&&<p>No matching source. Try another literal term.</p>}{result.nextCursor&&<button type="button" className="text-button" disabled={busy} onClick={()=>void search(result.nextCursor!)}>Load more search results</button>}{result.limitations.map(limit=><p className="search-limitation" key={limit}>{limit}</p>)}</>}
  </section>;
}
