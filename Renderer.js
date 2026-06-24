const Renderer = function (html, on) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  let id = 0;
  const declarations = [];
  const appends = [];

  function walk(node, parentVar = null) {
    // ==========================
    // TEXT NODE
    // ==========================
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;

      if (!text || !text.trim()) return null;

      const name = "t_" + (id++);

      declarations.push(
        `var ${name} = document.createTextNode(${Renderer.variable(text)});`
      );

      if (parentVar) {
        appends.push(`${parentVar}.appendChild(${name});`);
      }

      return name;
    }

    // ==========================
    // ELEMENT NODE
    // ==========================
    if (node.nodeType === Node.ELEMENT_NODE) {

      const name = "el_" + (id++);

      declarations.push(
        `var ${name} = document.createElement("${node.tagName.toLowerCase()}");`
      );

      [...node.attributes].forEach(attr => {

        if (attr.name == "@html") {

          declarations.push(
            `${name}.innerHTML=${Renderer.variable(attr.value)};`
          );

        } else if (
          attr.name.startsWith("(") ||
          attr.name.endsWith(")") ||
          attr.name.startsWith("@")
        ) {

          // ignore

        } else {

          declarations.push(
            `${name}.setAttribute("${attr.name}", ${Renderer.variable(attr.value)});`
          );

        }

      });

      [...node.childNodes].forEach(child => {
        walk(child, name);
      });

      Renderer._on.map(fn => {
        declarations.push(fn(node, name));
      });

      if (on) {
        declarations.push(on(node, name));
      }

      if (parentVar && node.attributes["@parent"]==null) {
        appends.push(`${parentVar}.appendChild(${name});`);
      }

      return name;
    }

    return null;
  }

  const roots = [
    ...doc.body.childNodes,
    ...doc.head.childNodes
  ];

  const rootVars = [];

  roots.forEach(node => {
    const v = walk(node, null);
    if (v) rootVars.push(v);
  });

  let incode = `
    ${declarations.join("\n")}
    ${appends.join("\n")}
    return ${rootVars[0] || "null"};
  `

  console.log(incode)

  return new Function("_", incode);
};

// ==========================
// STRING TEMPLATE
// ==========================
Renderer.variable = function (text) {

  return "`" + text

    .replace(/\{([^{}]+)\}/g, (_, expr) => {
      return "${(" + expr.trim() + ")}";
    })

    .replace(/\$([a-zA-Z0-9_.@]+)/g, (_, v) => {
      return "${_['" + v.split(".").join("']['") + "']}";
    })

    + "`";
};

// ==========================
// EXPRESSION PARSER
// ==========================
Renderer.expression = function (text) {

  text = text.trim();

  const expr = text.match(/^\{([\s\S]+)\}$/);

  if (expr) {
    return expr[1].trim();
  }

  if (text.startsWith("$")) {
    return "_['" + text.slice(1).split(".").join("']['") + "']";
  }

  return text;
};

Renderer.items    = {}
Renderer.forEachs = {}


Renderer._on = []
Renderer.on = function(fn){
  Renderer._on.push(fn)
}

Renderer.on(function(node,name){
  let code = "";
  [...node.attributes].map(attr => {
    if(attr.name=="@item"){
      code += "Renderer.items["+Renderer.variable(attr.value)+"]="+name+";\n"
      code += name+".item="+Renderer.variable(attr.value)+";\n"
      code += "Baser.ondel("+Renderer.variable(attr.value)+",()=>{"+name+".remove();delete(Renderer.items["+Renderer.variable(attr.value)+"]); return false;});\n"
    }else if(attr.name=="@parent"){
      if(node.attributes["@item"]){
        code +="let _parent = document.querySelector("+ Renderer.variable(node.attributes["@parent"].nodeValue)+");\n";
        code +="let _old    = Renderer.items["+ Renderer.variable(node.attributes["@item"].nodeValue)+"];\n";
        code +="if(_parent){\n"; 
        code +="let _replace = Array.from(_parent.children).find(e=>e.item=="+Renderer.variable(node.attributes["@item"].value)+");\n";
        code +="if(_replace){\n"
        code +="_replace.replaceWith("+name+");\n"
        code +="}else{\n"
        code +="if(_old){_old.remove()};\n"
        code +="_parent.appendChild("+name+");"
        code +="};\n"
        code +="};\n"
      }else{
        code +="if(document.querySelector('"+attr.value+"')){document.querySelector('"+attr.value+"').appendChild("+name+");};\n"
      }
    }else if(attr.name.startsWith("(")&&attr.name.endsWith(")")){
      if(attr.name=="(@html)"){
        code += name+".innerHTML = Baser.get("+Renderer.variable(attr.value)+");\n";
        code += "Baser.on("+Renderer.variable(attr.value)+",(s,p,o,v)=>{ "+name+".innerHTML=v; return "+name+".isConnected; });\n"
      }else{
        code += name+".setAttribute( '"+attr.name.slice(1,-1)+"' ,Baser.get("+Renderer.variable(attr.value)+"));\n";
        code += "Baser.on("+Renderer.variable(attr.value)+",(s,p,o,v)=>{ "+name+".setAttribute('"+attr.name.slice(1,-1)+"',v); return "+name+".isConnected; });\n"
      }
    }
  })
  return code;
});







const Emitter = function (obj) {
  let triggers = [];
  obj.any = function (process, order=0) {
    triggers.push({
      event:"",
      process,
      order,
      type: 'any'
    });
  }
  obj.on = function (event, process, order=0) {
    triggers.push({
      event,
      process,
      order,
      type: 'on'
    });
  }
  obj.one = function (event, process, order=0) {
    triggers.push({
      event, 
      process,
      order,
      type: 'once'
    });
  }
  obj.emit = function (event, ...args) {
    for (let i=0; i<triggers.length ; i++) {
      const trigger = triggers[i]
      if (trigger.event == event && trigger.type!="any") {
        trigger.process.apply(obj, args);
        if (trigger.type == 'once') {
          triggers.splice(triggers.indexOf(trigger), 1);
          i--;
        }
      }
      if(trigger.type=="any"){
        trigger.process.apply(obj, [event,...args] );
      }
    }
  }
}


// @Baser
const Baser = {}

//@ Baser.match
/* 
  user.15/name
  user._.name
  user.:id.name
  user.*
*/
Baser.match = function (code, pattern = "*") {
  if (!code || !pattern) return null;
  code = code.replace(/\//g, ".");
  pattern = pattern.replace(/\//g, ".");

  const paramNames = [];
  const regex = new RegExp("^" + pattern.replace(/\./g, "\\.").replace(/\$/g, "\\$").replace(/\*/g, "(.*)")
    .replace(/:([a-zA-Z0-9_]+)/g, (_, name) => {
      paramNames.push(name);
      return "([^\\.]+?)";
    }).replace(/_/g, () => {
      paramNames.push(paramNames.length);
      return "([^\\.]+?)";
    }) + "$");

  const match = code.match(regex);
  if (!match) return null;
  const result = {};
  match.slice(1).forEach((val, i) => {
    const key = paramNames[i] ?? i;
    result[key] = isNaN(val) ? val : Number(val);
  });
  return result;
};


Baser.list = function(path) {
  const keys = path.split(".").filter(e => e.trim() !== "");
  function recurse(obj, idx, prefix) {
    if (obj == null) return [];
    const key = keys[idx];
    let results = [];
    if (idx === keys.length - 1) {
      if (key === "_") {
        for (const k in obj) { results.push([prefix + k, obj[k]]); }
      } else {
        if (obj[key] !== undefined) { results.push([prefix + key, obj[key]]); }
      }
    } else {
      if (key === "_") {
        for (const k in obj) {
          results = results.concat( recurse(obj[k], idx + 1, prefix + k + ".") );
        }
      } else {
        if (obj[key] !== undefined) {
          results = results.concat( recurse(obj[key], idx + 1, prefix + key + ".") );
        }
      }
    }
    return results;
  }
  return recurse(Baser.data, 0, "");
}




Baser.list = function(path){
  const keys = path.split(".").filter(e => e.trim() !== "");

  function matchKey(pattern, key) {
    if (pattern === "_") return true;

    // "da*" -> regex: /^da.*$/
    const regex = new RegExp("^" + pattern.split("*").map(escapeRegex).join(".*") + "$");
    return regex.test(key);
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function recurse(obj, idx, prefix) {
    if (obj == null) return [];

    const key = keys[idx];
    let results = [];

    const isWildcard = key.includes("*") || key === "_";

    const getKeys = (obj) => {
      return isWildcard
        ? Object.keys(obj).filter(k => matchKey(key, k))
        : (obj[key] !== undefined ? [key] : []);
    };

    if (idx === keys.length - 1) {
      for (const k of getKeys(obj)) {
        results.push([prefix + k, obj[k]]);
      }
    } else {
      for (const k of getKeys(obj)) {
        results = results.concat(
          recurse(obj[k], idx + 1, prefix + k + ".")
        );
      }
    }

    return results;
  }

  return recurse(Baser.data, 0, "");


}


Baser.data = {}



Baser._on = []
Baser.on = function(patterns,func){
  return patterns.split(",").map(e=>e.trim()).map(pattern=>Baser._on.push({pattern,func}) )
}

Baser.once = function(patterns,func){
  patterns.split(",").map(e=>e.trim()).map(pattern=> Baser._on.push({pattern,func,once:true}) )
}

Baser._ondel = []
Baser.ondel = function(patterns,func){
  patterns.split(",").map(e=>e.trim()).map(pattern=> Baser._ondel.push({pattern,func}) )
}


Baser.set = function(data,value,skip=false){
  let keys = data.split(".").filter(e=>e.trim()!="");
  data = keys.join(".")
  let oldValue = Baser.get(data)
  let is_new = true
  if(!skip){
    let _v = Baser.data
    for(let i =0 ; i<keys.length-1; i++){
      _v = _v[keys[i]] = _v[keys[i]] || {}
    }
    if(_v[keys[keys.length-1]]!=null) is_new=false
    _v[keys[keys.length-1]] = value
  }

  for(let i = Baser._on.length-1; i>=0; i-- ){
    let pattern=Baser._on[i].pattern,func=Baser._on[i].func,once=Baser._on[i].once
    let params = Baser.match(data,pattern)
    if(params){
      let response = func(data,params,oldValue,value)
      if(once || response===false){
        Baser._on.splice(i, 1);
      }
    }
  }

  Baser.wemit(data)
  
}




Baser.get = function(data,def=null){
  let keys = data.split(".").filter(e=>e.trim()!="");
  data = keys.join(".")
  let _v = Baser.data
  for(let i =0 ; i<keys.length-1; i++){
    if(_v==null) return def
    _v = _v[keys[i]]
  }
  if(_v==null) return def
  if(_v[keys[keys.length-1]]!=null) return _v[keys[keys.length-1]]
  return def
}




Baser.del = function(data,skip=false){
  let keys = data.split(".").filter(e=>e.trim()!="");
  data = keys.join(".")
  let oldValue = Baser.get(data)
  if(!skip){
    let _v = Baser.data
    for(let i =0 ; i<keys.length-1; i++){
      if(_v==null) break
      _v = _v[keys[i]]
    }
    if(_v!=null)
      delete _v[keys[keys.length-1]] 
  }
  

  for(let i = Baser._ondel.length-1; i>=0; i-- ){

    let pattern = Baser._ondel[i].pattern
    let func    = Baser._ondel[i].func
    let params  = Baser.match(data,pattern)
    if(params){
      let response = func(data,params,oldValue)
      if(response===false){
        Baser._ondel.splice(i, 1);
      }
    }
  }
  Baser.wemit(data)

}


Baser.same = function(path1, path2) {
  const a = path1.split(".").filter(Boolean);
  const b = path2.split(".").filter(Boolean);

  function match(segA, segB) {
    if (segA === "_" || segB === "_") return true;

    // wildcard prefix: "y*" vs "yxxxx"
    if (segA.includes("*") || segB.includes("*")) {
      const [pat, val] = segA.includes("*")
        ? [segA, segB]
        : [segB, segA];

      const prefix = pat.split("*")[0];
      return val.startsWith(prefix);
    }

    return segA === segB;
  }

  function dfs(i, j) {
    if (i === a.length || j === b.length) {
      // biri bittiyse kalan segmentler sadece wildcard ise devam edebilir
      const restA = a.slice(i);
      const restB = b.slice(j);

      const allWildcard = segs =>
        segs.every(s => s === "_" || s.includes("*"));

      return allWildcard(restA) && allWildcard(restB);
    }

    const segA = a[i];
    const segB = b[j];

    if (segA === "_") {
      // A wildcard → B'nin her ihtimali denenir
      return true;
    }
    if (segB === "_") {
      return true;
    }
    if (segA.includes("*") || segB.includes("*") || segA === segB) {
      if (match(segA, segB)) {
        return dfs(i + 1, j + 1);
      }
      return false;
    }
    return false;
  }
  return dfs(0, 0);
};

Baser._whens = []

Baser._wemits = {}

Baser.wemit = function(k){
  for(let when of Baser._whens){
    if(!Baser.same(when.Path,k)){
      continue
    }
    console.log("SEARCH::",when.Path,k)
    // buraya same ise devam et diyecceğiz
    let list = Baser.list(when.Path)
    for( let pair of list ){
      let key = pair[0], val = pair[1]
      if(Baser._wemits[when.Path][key]==null && pair[1]){
        //new
        console.log("ADDING",when.Ons.Add)
        when.Ons.Add(key,val)
        Baser._wemits[when.Path][key] = val
      }else if(Baser._wemits[when.Path][key]!=null && Baser._wemits[when.Path][key]!=val){
        console.log("SETTING")
        when.Ons.Set(key,val)
        Baser._wemits[when.Path][key] = val
      }
    }
    
    for( let key in Baser._wemits[when.Path] ){
      if(Baser.get(key,undefined)==undefined){
        console.log("DELETING")
        when.Ons.Del(key)
        delete( Baser._wemits[when.Path][key] )
      }
    }

  }
}

Baser.when = function(Path,Ons={}){
  if(Ons.Add == null && Ons.add==null){ Ons.Add =()=>{}; }
  if(Ons.Set == null && Ons.set==null){ Ons.Set =()=>{}; }
  if(Ons.Del == null && Ons.del==null){ Ons.Del =()=>{}; }
  
  if(Ons.Add == null && Ons.add!=null){ Ons.Add = Ons.add; }
  if(Ons.Set == null && Ons.set!=null){ Ons.Set = Ons.set; }
  if(Ons.Del == null && Ons.del!=null){ Ons.Del = Ons.del; }
  
  
  Baser._whens.push({Path,Ons})
  Baser._wemits[Path] = {}
}








const Elementer = {};
Elementer.render = function(html){
    var mime = html.indexOf("xmlns=") == -1 ? "text/html" : "image/svg+xml";   
    var parsed= Elementer.render.parser.parseFromString(html, mime);
    return mime=="text/html" ? parsed.body.firstChild : parsed.firstChild;
}
Elementer.render.parser = new DOMParser();
Elementer.when = function(selector, process, order = 0, type = "on") {
  if (!Elementer.when.observer) {
    Elementer.when.triggers = [];
    Elementer.when.check = function(nodes) {
      for (const node of nodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        for (const trigger of [...Elementer.when.triggers]) {
          if (node.matches(trigger.selector)) {
            trigger.process.call(node, node);
            if (trigger.type === "once") {
              Elementer.when.triggers.splice(Elementer.when.triggers.indexOf(trigger),1);
            }
          }
          for (const el of node.querySelectorAll(trigger.selector)) {
            trigger.process.call(el, el);
            if (trigger.type === "once") {
              Elementer.when.triggers.splice(Elementer.when.triggers.indexOf(trigger),1);
            }
          }
        }
      }
    };

    Elementer.when.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          Elementer.when.check(mutation.addedNodes);
        }
      }
    });

    Elementer.when.observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    const init = () => Elementer.when.check([document.documentElement]);

    if ( document.readyState === "interactive" || document.readyState === "complete" ) {
      init();
    } else {
      document.addEventListener("DOMContentLoaded", init);
    }
  }

  Elementer.when.triggers.push({
    selector,
    process,
    order,
    type
  });
};


Elementer.then = function(selector, process, order = 0, type = "on") {
  if (!Elementer.then.observer) {
    Elementer.then.triggers = [];
    Elementer.then.check = function(nodes) {
      for (const node of nodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        for (const trigger of [...Elementer.then.triggers]) {
          if (node.matches(trigger.selector)) {
            trigger.process.call(node, node);
            if (trigger.type === "once") {
              Elementer.then.triggers.splice(Elementer.then.triggers.indexOf(trigger),1);
            }
          }

          for (const el of node.querySelectorAll(trigger.selector)) {
            trigger.process.call(el, el);
            if (trigger.type === "once") {
              Elementer.then.triggers.splice(Elementer.then.triggers.indexOf(trigger),1);
            }
          }
        }
      }
    };

    Elementer.then.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          Elementer.then.check(mutation.removedNodes);
        }
      }
    });

    Elementer.then.observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  Elementer.then.triggers.push({
    selector,
    process,
    order,
    type
  });
};
