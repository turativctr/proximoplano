#!/usr/bin/env node
/** Contratos dos temas: tokens completos, contraste dos pares e famílias funcionais.
 * Cálculo WCAG em sRGB; também compõe o vidro sobre a página e os orbs.
 * Não substitui a revisão da interface renderizada nem certifica conformidade do aplicativo.
 */
import { readFileSync } from "node:fs";
const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const names = ["documentario", "noir", "comedia", "historico", "horror", "drama", "telenovela", "futurista", "fantasia", "thriller"];
const modules = ["scheduling", "budgeting", "drafts", "decupagem", "alerta", "erro", "sucesso", "neutro"];
const themes = Object.fromEntries(names.map(name => {
  const block = css.match(new RegExp(`\\[data-theme="${name}"\\]\\s*\\{([^}]+)\\}`))?.[1];
  if (!block) throw new Error(`Tema ausente: ${name}`);
  return [name, Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]))];
}));
const required = [...new Set([
  ...Object.values(themes).flatMap(Object.keys),
  "page-bg", "page-bg-from", "page-bg-via", "page-bg-to", "surface", "surface-border", "text", "text-muted",
  "chrome-bg", "chrome-border", "chrome-border-width", "chrome-decoration", "chrome-shadow", "status-icon-display",
  "chrome-decoration-size", "chrome-decoration-repeat", "chrome-light-max", "panel-shadow", "panel-radius", "theme-focus-shadow",
  ...modules.flatMap(key => [key+"-bg", key+"-fg", key+"-accent"]),
  ...["background", "card", "popover", "primary", "secondary", "muted", "accent", "destructive"].flatMap(key => [key, key==="background"?"foreground":key+"-foreground"]),
  "border", "input", "ring",
])];
const errors = [];
function rgb(t, key) {
  const parts = t[key]?.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
  if (!parts || parts.length !== 3) throw new Error(`Cor inválida: ${key}`);
  if (!t[key].includes("%")) return parts;
  const [h,s0,l0]=parts, s=s0/100,l=l0/100;
  const a=s*Math.min(l,1-l);
  return [0,8,4].map(n=> { const k=(n+h/30)%12; return 255*(l-a*Math.max(-1,Math.min(k-3,9-k,1))); });
}
function mix(a,b,alpha) { return a.map((v,i)=>v*alpha+b[i]*(1-alpha)); }
function luminance(c) { return c.map(v=> { v/=255; return v<=.04045?v/12.92:((v+.055)/1.055)**2.4; }).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0); }
function contrast(a,b) { const [lo,hi]=[luminance(a),luminance(b)].sort((a,b)=>a-b); return (hi+.05)/(lo+.05); }
function hue(c) { const [r,g,b]=c.map(x=>x/255), hi=Math.max(r,g,b), lo=Math.min(r,g,b),d=hi-lo; return d===0?0:((hi===r?(g-b)/d:hi===g?(b-r)/d+2:(r-g)/d+4)*60+360)%360; }
let checks=0;
for (const name of names) {
  const t=themes[name];
  for (const key of required) if (!(key in t)) errors.push(`${name}: --${key} ausente`);
  function check(fg,bg,label,min=4.5) { checks++; const ratio=contrast(fg,bg); if (!Number.isFinite(ratio) || ratio<min) errors.push(`${name}: ${label} ${ratio.toFixed(2)}:1 (mínimo ${min})`); }
  for(const surface of ["page-bg","surface","chrome-bg"]) for(const fg of ["text","text-muted"]) check(rgb(t,fg),rgb(t,surface),`${fg}/${surface}`);
  // Limite conservador da luz decorativa na moldura (branco é mais exigente nos escuros).
  for(const fg of ["text", "text-muted"]) {
    const chrome=mix([255,255,255],rgb(t,"chrome-bg"),Number(t["chrome-light-max"]));
    check(rgb(t,fg),chrome,`${fg}/luz decorativa`);
  }
  for(const key of modules) check(rgb(t,`${key}-fg`),rgb(t,`${key}-bg`),`${key}-fg/bg`);
  for(const key of ["background","card","popover","primary","secondary","muted","accent","destructive"]) {
    const fg=key==="background"?"foreground":`${key}-foreground`;
    check(rgb(t,fg),rgb(t,key),`${fg}/${key}`);
  }
  for(const key of ["surface","page-bg"]) check(rgb(t,"input"),rgb(t,key),`input/${key}`,3);
  // O vidro pode estar sobre qualquer módulo; compõe a opacidade antes de medir.
  for(const module of modules) {
    const under=mix(rgb(t,`${module}-accent`),rgb(t,"page-bg"),Number(t["orb-opacity"]));
    for(const alpha of ["surface-glass-alpha","surface-glass-subtle-alpha","surface-glass-hover-alpha"]) {
      const glass=mix(rgb(t,"surface"),under,Number(t[alpha]));
      for(const fg of ["text","text-muted"]) check(rgb(t,fg),glass,`${fg}/vidro ${module} ${alpha}`);
    }
  }
  for(const [key,min,max] of [["scheduling",190,235],["budgeting",65,165],["drafts",260,335],["decupagem",155,190]]) {
    const h=hue(rgb(t,`${key}-accent`));
    if(h<min||h>max) errors.push(`${name}: família de ${key} mudou (${h.toFixed(1)}°)`);
  }
  console.log(`✓ ${name}: ${Object.keys(t).length} tokens explícitos`);
}
for (const module of modules.slice(0,6)) {
  const values=names.map(name=>themes[name][`${module}-accent`]);
  if(new Set(values).size!==names.length) errors.push(`Accents repetidos em ${module}`);
}
if(errors.length) { console.error(errors.join("\n")); process.exitCode=1; }
else console.log(`\n${names.length} temas; ${checks} pares de contraste aprovados; famílias funcionais preservadas.`);
