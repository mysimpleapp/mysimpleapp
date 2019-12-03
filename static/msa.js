// method for cached query in dom
export function Q(query) {
	var qels = this._Qels
	if(qels===undefined)
		qels = this._Qels = {}
	var el = qels[query]
	if(el===undefined)
		el = qels[query] = this.querySelector(query)
	return el
}

// method for cached query in shadow dom
export function S(query) {
	var sels = this._Sels
	if(sels===undefined)
		sels = this._Sels = {}
	var el = sels[query]
	if(el===undefined)
		el = sels[query] = this.shadowRoot.querySelector(query)
	return el
}


// ajax //////////////////////////////////////////////

export function ajax(method, url, arg1, arg2) {
	if(typeof arg1==="function") var onsuccess=arg1
	else var args=arg1, onsuccess=arg2
	// build & send XMLHttpRequest
	const xhr = new XMLHttpRequest()
	// args
	const query = args && args.query
	let body = args && args.body
	const headers = args && ( args.headers || args.header )
	const loadingDom = args && args.loadingDom
	xhr.parseRes = args && args.parseRes
	if(args)
		for(let evt in args)
			if(evt.substring(0, 2)==="on")
				xhr[evt] = args[evt]
	// onsuccess (deprecated)
	if(onsuccess) {
		console.warn("DEPRECATED way of using Msa.ajax !\n"+(new Error().stack))
		xhr.onsuccess = onsuccess
	}
	// default onload
//	if(!xhr.onload) xhr.onload = _ajax_defaultOnload
	// url (with query)
	if(query) url = formatUrl(url, query)
	xhr.open(method, url, true)
	// body
	if(body) {
		// body format
		let contentType = args.contentType
		if(contentType===undefined){
			contentType = (typeof body==="object") ? 'application/json' : 'text/plain'
		}
		if(contentType) xhr.setRequestHeader('Content-Type', contentType)
		// format 
		if(contentType==='application/json')
			body = JSON.stringify(body)
	}
	// header
	if(headers)
		for(var h in headers)
			xhr.setRequestHeader(h, headers[h])
	// send request
	xhr.send(body)
	// loader
	if(loadingDom) {
		initLoader()
		loadingDom.classList.add("msa-loading")
	}
	// output promise
	const prm = new Promise((ok, ko) => {
		xhr.onload = evt => {
			if(loadingDom) loadingDom.classList.remove("msa-loading")
			const xhr = evt.target, status = xhr.status
			if(status>=200 && status<300)
				_ajax_parseRes(evt, ok)
			if(status>=400)
				_ajax_parseRes(evt, ko)
		}
	})
	if(xhr.onsuccess) prm.then(xhr.onsuccess)
	return prm
}
/*
const _ajax_defaultOnload = function(evt, ok, ko) {
	var xhr = evt.target, status = xhr.status
	if(status>=200 && status<300)
		_ajax_parseRes(evt, ok)
	if(status>=400)
		_ajax_parseRes(evt, ko)
}
*/
const _ajax_parseRes = function(evt, next){
	if(!next) return
	var xhr = evt.target
	var parseRes = (xhr.parseRes !== false)
	var type = xhr.getResponseHeader('content-type').split(';')[0]
	if(parseRes && type==='application/json'){
		var res = xhr.responseText
		var json = res ? JSON.parse(res) : null
		next(json, evt)
	} else if(parseRes && type==='application/xml'){
		next(xhr.responseXML, evt)
	} else {
		next(xhr.responseText, evt)
	}
}

// URL serialization /////////////////////////////////////////////

export function formatUrl(arg1, arg2) {
	// get base from location, if not provided
	if(arg2!==undefined) var base = arg1, args = arg2
	else var args = arg1, loc = window.location, base = loc.origin + loc.pathname
	// add args, if provided
	var res = base
	if(args) {
		var urlArgs = formatUrlArgs(args)
		if(urlArgs) res += '?' + formatUrlArgs(args)
	}
	return res
}
export function formatUrlArgs(args) {
	var res = []
	for(var a in args) {
		var val = args[a]
		if(val!==null && val!=="")
			res.push(encodeURIComponent(a) + "=" + encodeURIComponent(args[a]))
	}
	return res.join("&")
}

export function parseUrl(str) {
	// get string from location, if not provided
	if(str===undefined) str = window.location.href
	var res = { base:null, args:null }
	var pair = str.split('?')
	res.base = pair[0]
	var argsStr = pair[1]
	if(argsStr!==undefined)
		res.args = parseUrlArgs(argsStr)
	return res
}
export function parseUrlArgs(str) {
	// get string from location, if not provided
	if(str===undefined) str = window.location.search.substring(1)
	// parse args
	var res = {}
	str.split("&").forEach(function(keyVal){
		var pair = keyVal.split('=')
		if(pair.length==2)
			res[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1])
	})
	return res
}

// formatHtml /////////////////////////////////////////////

// format HTML expression to HTML object
export function formatHtml(htmlExpr) {
	return _formatHtml(htmlExpr, true)
}
const _formatHtml = function(htmlExpr, isHead) {
	// fill head & body objects
	const head = new Set(), body = []
	_formatHtml_core(htmlExpr, head, body, isHead)
	// format head & body to sring
	return {
		head: join(head, '\n'),
		body: body.join('\n')
	}
}
const _formatHtml_core = function(htmlExpr, head, body, isHead) {
	var type = typeof htmlExpr
	// case string
	if(type==="string") {
		_formatHtml_push(htmlExpr, head, body, isHead)
	} else if(type==="object") {
		// case array
		const len = htmlExpr.length
		if(len!==undefined) {
			for(let i=0; i<len; ++i)
				_formatHtml_core(htmlExpr[i], head, body, isHead)
		// case object
		} else {
			var tag = htmlExpr.tag
			var cnt = htmlExpr.content || htmlExpr.cnt
			var attrs = htmlExpr.attributes || htmlExpr.attrs
			var style = htmlExpr.style
			var imp = htmlExpr.import
			var mod = htmlExpr.module || htmlExpr.mod
			var js = htmlExpr.script || htmlExpr.js
			var css = htmlExpr.stylesheet || htmlExpr.css
			var wel = htmlExpr.webelement || htmlExpr.wel
			// web element
			if(wel) {
				const ext = wel.split(".").pop()
				if(ext === "html"){
					_formatHtml_core({ import:wel }, head, body, isHead)
					tag = tag || /([a-zA-Z0-9-_]*)\.html$/.exec(wel)[1]
				} else if(ext === "js"){
					_formatHtml_core({ mod:wel }, head, body, isHead)
					tag = tag || /([a-zA-Z0-9-_]*)\.js$/.exec(wel)[1]
				}
				isHead = false
			}
			// html import
			if(imp && !tag) {
				var importUrl = _formatHtml_toUrl(imp)
				tag = 'link'
				attrs = attrs || {}
				attrs.rel = 'import'
				attrs.href = importUrl
				isHead = true
			}
			// js module
			if(mod && !tag) {
				tag = 'script'
				attrs = attrs || {}
				attrs.src = mod
				attrs.type = 'module'
				isHead = true
			}
			// script
			if(js && !tag) {
				var jsUrl = _formatHtml_toUrl(js)
				tag = 'script'
				attrs = attrs || {}
				attrs.src = jsUrl
				isHead = true
			}
			// stylesheet
			if(css && !tag) {
				var cssUrl = _formatHtml_toUrl(css)
				tag = 'link'
				attrs = attrs || {}
				attrs.rel = 'stylesheet'
				attrs.type = 'text/css'
				attrs.href = cssUrl
				isHead = true
			}
			// tag (with attrs & content)
			tag = htmlExpr.tag || tag
			if(tag) {
				var str = '<'+tag
				// style
				if(style) {
					if(!attrs) attrs={}
					attrs.style = style
				}
				// attrs
				if(attrs)
					for(var a in attrs) {
						var val = attrs[a]
						if(a=='style') val = _formatHtml_style(val)
						str += ' '+ a +'="'+ val +'"'
					}
				str += '>'
				_formatHtml_push(str, head, body, isHead)
				// content
				if(cnt) _formatHtml_core(cnt, head, body, isHead)
				_formatHtml_push('</'+tag+'>', head, body, isHead)
			}
			// body
			_formatHtml_core(htmlExpr.body, head, body, false)
			// head
			_formatHtml_core(htmlExpr.head, head, body, true)
		}
	}
}
const _formatHtml_style = function(style) {
	var type = typeof style
	if(type==="string") return style
	else if(type==="object") {
		var str = ""
		for(var a in style) str += a+':'+style[a]+'; '
		return str
	}
}
const _formatHtml_push = function(html, head, body, isHead) {
	if(isHead) head.add(html)
	else body.push(html)
}
const _formatHtml_toUrl = function(url) {
	return url
}

// importHtml ///////////////////////////////////

// cache of promises on any content imported into document head
const ImportCache = {}

export function importHtml(html, el) {
//	const isHead = (typeof html !== "string" || el === undefined)
	const isHead = el ? false : true
	html = _formatHtml(html, isHead)
	const head = html.head, body = html.body
	const newEls = []
	const loads = []
	if(head) {
		// parse input head content
		const headTemplate = document.createElement("template")
		headTemplate.innerHTML = head
		// for each inpu head element 
		for(let h of headTemplate.content.children) {
			// check if it is already in cache
			const hHtml = h.outerHTML
			let prm = ImportCache[hHtml]
			if(!prm) {
				// create promise to load input head
				const h2 = cloneEl(h) // hack to force scripts to load
				prm = ImportCache[hHtml] = new Promise((ok, ko) => {
					h2.addEventListener("load", ok)
					h2.addEventListener("error", ko)
					document.head.appendChild(h2)
				})
			}
			loads.push(prm)
		}
	}
	if(body) {
		const bodyTemplate = document.createElement("template")
		bodyTemplate.innerHTML = body
		for(let b of bodyTemplate.content.children) {
			newEls.push(b)
			if(el !== true) el.appendChild(b)
		}
	}
	return new Promise((ok, ko) => {
		Promise.all(loads)
			.then(() => ok(newEls))
			.catch(ko)
	})
}

export function importOnCall(src, fun) {
	return async function(...args) {
		const mod = await import(src)
		return mod[fun](...args)
	}
}


// loader ///////////////////////////////////

// default loader (can be modified by setLoaderHtml)
let loaderHtml = `<style>

	msa-loader {
		height: 1.5em;
		width: 1.5em;
		background-position: center center;
		background-repeat: no-repeat;
		background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' style='fill:none; stroke:black; stroke-width:15'><path d='M15,50 a1,1 0 0,0 70,0' /></svg>");
		animation: msa-loader-spin 1s linear infinite;
	}

	@keyframes msa-loader-spin {
		from{transform:rotate(0deg)}
		to{transform:rotate(360deg)}	
	}
</style>`

// default loader style
importHtml(`<style>
	msa-loader {
		display: none;
		height: 1.5em;
		width: 1.5em;
		margin: auto;
		top: 0;
		bottom: 0;
		left: 0;
		right: 0;
	}
	msa-loader.msa-loading, .msa-loading msa-loader {
		display: inline-block;
	}

	.msa-loading.msa-loading-invisible, .msa-loading .msa-loading-invisible {
		visibility: hidden;
	}
	.msa-loading.msa-loading-hidden, .msa-loading .msa-loading-hidden {
		display: none;
	}

</style>`)

let loaderInitialised = false

export function setLoaderHtml(html) {
	loaderHtml = html
}

function initLoader(){
	if(loaderInitialised) return
	loaderInitialised = true
	importHtml(loaderHtml)
}

// helpers ///////////////////////////////////

function cloneEl(el) {
	const el2 = document.createElement(el.tagName)
	for(let att of el.attributes)
		el2.setAttribute(att.name, att.value)
	el2.innerHTML = el.innerHTML
	return el2
}

function deepGet(obj, key) {
	const keys = key.split('.')
	for(let k of keys) {
		if(obj === undefined) return
		obj = obj[k]
	}
	return obj
}

function join(cont, delim) {
	let res = "", first = true
	for(var c of cont) {
		if(first) first = false
		else res += delim
		res += c
	}
	return res
}

