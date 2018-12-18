// require
const { promisify:prm } = require('util')
const { join, dirname } = require('path')
const fs = require('fs')
const readFile = prm(fs.readFile),
	writeFile = prm(fs.writeFile)
const { spawn } = require('child_process')
const readline = require('readline')
const express = require('express')
//var fs = require('fs')
//var sh = require('shelljs')
//const glob = require('glob')

// global Msa object
global.Msa = global.MySimpleApp = {}
Msa.dirname = __dirname
//Msa.compsDir = Msa.dirname+'/bower_components'
//Msa.compsUrl = "/bower_components"
Msa.express = express
Msa.bodyParser = require("body-parser")
//Msa.jsonBodyMdw = Msa.bodyMdw.json()
Msa.paramsFiles = []

// html expr
require('./htmlExpr')

// main //////////////////////

const help =
`Script to install or start a MySimpleApp server

Usage: node ${process.argv[1]} [ACTION] [MODULE] [OPTIONS]

  ACTION: "install" or "start". If not provided, both actions will be executed.

  MODULE (install only): module to install. If not provided, all modules are installed.

  OPTIONS:
    -p/--params: MSA parameters (JSON format)
    -pf/--params-file: Path to file containing MSA parameters (JSON format, default: "msa_params.json")
    -y/--yes (install only): Automatically reply with default value to all questions
    -f/--force (install only): Force re-intall, already installed modules`

const main = async function(next){
	try {

		// get input args
		const argv = process.argv
		var action, mod, params=[], paramsFiles=[], yes=false, force=false
		for(let i=2; i<argv.length; ++i){
			arg = argv[i]
			if(arg==="-h" || arg==="--help") { console.log(help); return next() }
			else if(arg==="-p" || arg==="--params") params.push(argv[++i])
			else if(arg==="-pf" || arg==="--params-file") paramsFiles.push(argv[++i])
			else if(arg==="-y" || arg==="--yes") yes = true
			else if(arg==="-f" || arg==="--force") force = true
			else if(!action && arg[0]!=='-') action = arg
			else if(action && !mod && arg[0]!=='-') mod = arg
			else { console.error(`Unknown option ${arg}`); process.exit(1) }
		}

		// fill Msa.paramsFiles
		const defParamFile = join(__dirname, "msa_params.json")
		if(await fileExists(defParamFile))
			Msa.paramsFiles.push(defParamFile)
		for(let f of paramsFiles)
			Msa.paramsFiles.push(f)

		// fill Msa.params
		for(let f of Msa.paramsFiles){
			try {
				const p = await readFile(f)
				deepMerge(Msa.params, JSON.parse(p))
			} catch(err) {
				console.warn(`Could not read & parse params file "${f}"`)
				console.log(err)
			}
		}
		for(let p of params)
			deepMerge(Msa.params, JSON.parse(p))

		// action
		if(!action || action == "install")
			await installMsa({ mod, yes, force })
		if(!action || action == "start")
			await startMsa()

	} catch(err) { next(err) }
	next()
}

// params /////////////////////////

// default params
Msa.params = {
  log_level: 'DEBUG',
  server: {
    port: "dev",
    https: {
      activated: false
    }
  }
}

Msa.paramDefs = {}
//Msa.paramsDescs = {}

Msa.ParamDef = class {
	constructor(key, kwargs){
		this.key = key
		Object.assign(this, kwargs)
		// register
		Msa.paramDefs[this.key] = this
		// init value
		this.init()
	}
}
const ParamDefPt = Msa.ParamDef.prototype

ParamDefPt.init = function() {
	if(this.get() === undefined && this.defVal !== undefined)
		this.set(this.defVal)
}

ParamDefPt.get = function() {
	return getDeep(Msa.params, this.key)
}

ParamDefPt.set = function(val, kwargs) {
	this.val = val
	setDeep(Msa.params, this.key, val)
	if(!kwargs || kwargs.save !== false)
		this.save()
}

ParamDefPt.save = function() {
	ParamDefSaveStack = ParamDefSaveStack.then(() => {
		return new Promise(async (ok, ko) => {
			try {
				const paramFile = Msa.paramsFile[0]
				if(!paramFile) throw "No params file to save in."
				const params = JSON.parse(await readFile(paramsFile))
				const key = this.key, val = this.val
				setDeep(params, key, val)
				await writeFile(paramsFile, JSON.stringify(params, null, 2))
			} catch(err) { return ko(err) }
			ok()
		})
	})
}
let ParamDefSaveStack = Promise.resolve()

Msa.getParam = function(key) {
	return getDeep(Msa.params, key)
}

Msa.setParam = function(key, val, kwargs) {
	const def = Msa.paramDefs[key]
	if(def) def.set(val, kwargs)
	else setDeep(Msa.params, key, val)
}

/*
Msa.registerParam = function(arg1, arg2){
	const targ1 = typeof arg1
	if(targ1 == "string")
		_registerParam(arg1, arg2)
	else if(targ1 == "object")
		for(let key in arg1)
			_registerParam(key, arg1[key])
}
const _registerParam = function(key, desc){
	Msa.paramsDescs[key] = new Msa.ParamDesc(key, desc)
	const val = Msa.getParam(key)
	if(val === undefined && desc.defVal !== undefined)
		Msa.setParam(key, desc.defVal)
}
*/
function getDeep(obj, key){
	const keys = key.split('.')
	for(let k of keys){
		obj = obj[k]
		if(obj===undefined) return
	}
	return obj
}
/*
Msa.setParam = function(key, val, kwargs){
	// update val in Msa.params (synchronouly)
	const desc = Msa.paramsDescs[key]
	desc.val = val
	_setParamInObj(Msa.params, key, val)
	// save (asynchronously)
	if(!kwargs || kwargs.save!==false) {
		return new Promise(async (ok, ko) => {
			try {
				if(desc) await desc.save()
			} catch(err) { return ko(err) }
			ok()
		})
	}
}
*/
function setDeep(obj, key, val) {
	const keys = key.split('.'), len = keys.length
	for(let i=0; i<len-1; ++i){
		let k = keys[i], obj2 = obj[k]
		if(obj2 === undefined)
			obj2 = obj[k] = {}
		obj = obj2
	}
	obj[keys[len-1]] = val
}


// install //////////////////////////////////

const installMsa = function({ mod=null, yes=false, force=false, itf=null } = {}){
	return new Promise(async (ok, ko) => {
		try {
			const mods = mod ? [mod] : Object.values(Msa.params.msa_modules || {})
			if(!itf) itf = new Msa.InstallInterface({ yes:yes, force:force })
			for(let m of mods){
				await itf.install(m)
			}
		} catch(err) { return ko(err) }
		ok()
	})
}

// interface

Msa.InstallInterface = class {
	constructor({ yes=false, force=false } = {}){
		this.yes = yes
		this.force = force
		this.installedMods = []
	}
}
var InstallInterfacePt = Msa.InstallInterface.prototype

InstallInterfacePt.log = function(...args){
	console.log(...args)
}

InstallInterfacePt.exec = function(cmd, args, kwargs){
	return new Promise((ok, ko) => {
		try {
			const spawn_kwargs = Object.assign({ stdio: 'inherit', cwd: Msa.dirname }, kwargs)
			const proc = spawn(cmd, args, spawn_kwargs)
			proc.on('close', code => {
				if (code !== 0) ko(code)
				else ok()
			})
		} catch(err) { return ko(err) }
	})
}

InstallInterfacePt.npm = function(...args){
	return this.exec('npm', args)
}

InstallInterfacePt.question = function(question){
	return new Promise(async (ok, ko) => {
		try {
			if(isArr(question)) {
				var res = []
				for(var q of question)
					res.push( await this.question(q) )
				ok(res)
			} else {
				if(typeof question === "string") question = { question }
				var questionStr = question.question
				if(question.defVal !== undefined) questionStr += ` (default value: ${question.defVal} )`
				if(question.choices !== undefined) questionStr += ` (possible values: ${question.choices.join(' / ')} )`
				const rl = readline.createInterface({
					input: process.stdin,
					output: process.stdout
				})
				rl.question(questionStr +' ', answer => {
					rl.close()
					if(answer==="" && question.defVal!==undefined) answer = question.defVal
					ok(answer)
				})
			}
		} catch(err) { return ko(err) }
	})
}

InstallInterfacePt.questionParam = function(param){
	return new Promise(async (ok, ko) => {
		var res
		try {
			// select & format params to be questionned
			var params = isArr(param) ? param : [param]
			params = params.map(p => (typeof p === "string") ? { key:p } : p)
			if(!this.force) params = params.filter(p => Msa.getParam(p.key) === undefined)
			// format questions
			let questions = []
			for(let p of params) {
				const paramKey = p.key, paramDef = Msa.paramDefs[paramKey]
				const question = p.question || `Choose a value for this parameter "${paramKey}"`
				const { choices, defVal } = Object.assign(p, paramDef)
				questions.push({ question, choices, defVal })
			}
			// ask questions
			res = await this.question(questions)
			// update params
			for(let i=0, len=params.length; i<len; ++i)
				Msa.setParam(params[i].key, res[i])
		} catch(err) { return ko(err) }
		ok(res)
	})
}

InstallInterfacePt.install = function(mod, kwargs){
	return new Promise(async (ok, ko) => {
		try {
			// check that this module has not already been installed by this itf (to avoid infinite loop)
			if(this.installedMods.indexOf(mod) > -1) return ok()
			this.installedMods.push(mod)
			// npm install
			const dir = ( kwargs && kwargs.dir ) || Msa.dirname
			var modPath = tryResolve(mod, { paths:[dir] })
			if(this.force || !modPath) {
				this.log(`### install "${mod}"`)
				await this.exec('npm', ['install', mod], { cwd:dir })
				modPath = require.resolve(mod)
			}
			// msa_install
			const msaInstallPath = tryResolve( join(dirname(modPath), "msa_install") )
			if(msaInstallPath) {
				const msaInstallPrm = prm(require(msaInstallPath))
				await msaInstallPrm(this)
			}
		} catch(err) { return ko(err) }
		ok()
	})
}

InstallInterfacePt.installMsaMod = function(modKey, mod, kwargs){
	const pMod = Msa.getParam(`msa_modules.${modKey}`)
	if(pMod) mod = pMod
	return this.install(mod, kwargs)
}

// start //////////////////////////////////

const startMsa = function() {
	return new Promise(async (ok, ko) => {
		try {
			// create modules router
//			Msa.preRouter = express()
			Msa.modulesRouter = express.Router()
			var msa_modules = Msa.params.msa_modules || {} 
			// start msa modules
			for(let modRoute in msa_modules)
				await Msa.start(msa_modules[modRoute])
			// create msa router
			var msaMod = new Msa.Module("msa")
			initMsaModule(msaMod, __dirname)
			// require msa modules 
			for(let modRoute in msa_modules){
				let modDir = join(Msa.dirname, "node_modules", msa_modules[modRoute]),
					mod = require(modDir)
				initMsaModule(mod, modDir)
			}
			// use main moduke
			Msa.app = Msa.mainMod.app
			// start server
			startServer()
		} catch(err) { return ko(err) }
		ok()
	})
}

const startedMods = {}
Msa.start = function(mod){
	return new Promise(async (ok, ko) => {
		try {
			// start only once
			var res = startedMods[mod]
			if(res !== undefined) return ok(res)
			res = startedMods[mod] = null
			// msa_install
			const modPath = require.resolve(mod, { paths:[Msa.dirname] })
			const msaStartPath = tryResolve( join(dirname(modPath), "msa_start") )
			if(msaStartPath) {
				const msaStartPrm = prm(require(msaStartPath))
				res = startedMods[mod] = await msaStartPrm()
			}
			ok(res)
		} catch(err){ ko(err) }
	})
}

var startServer = function() {
  var paramsServer = Msa.params.server,
      isHttps = paramsServer.https.activated
  // create server
  if(isHttps) {
    var https = require('https')
    var cred = {
      key: fs.readFileSync(paramsServer.https.key),
      cert: fs.readFileSync(paramsServer.https.cert)
    }
    var server = https.createServer(cred, Msa.app)
  } else {
    var http = require('http')
    var server = http.createServer(Msa.app)
  }
  // determine port
  var port = paramsServer.port
  if(port=="dev") port = isHttps ? 8443 : 8080
  if(port=="prd") port = isHttps ? 81 : 80
  // start server
  server.listen(port)
  // log
  var prot = isHttps ? "https" : "http"
  console.log("Server ready: "+prot+"://localhost:"+port+"/")
}


// modules

Msa.modules = {}

Msa.Module = class {
	constructor(key) {
		this.key = key
		this.app = Msa.subApp()
	}
}

Msa.subApp = function() {
	const oSubApp = express()
//	oSubApp.getAsPartial = subApp_getAsPartial
	oSubApp.subApp = subApp_subApp
	return oSubApp
}

Msa.require = function(key){
  const modDir = join(Msa.dirname, "node_modules", Msa.params.msa_modules[key])
  return require(modDir)
}
/*
var requireMsaModules = function() {
  var msa_modules = Msa.params.msa_modules || {} 
  for(let route in msa_modules){
    let modDir = join(Msa.dirname, "node_modules", msa_modules[route]),
        mod = require(modDir)
    initMsaModule(mod, modDir)
  }
}
*/
var initMsaModule = function(mod, modDir) {
  // static files
  mod.dirname = modDir
  var staticDir = modDir+"/static"
  fs.stat(staticDir, (err, stats) => {
    if(!err && stats && stats.isDirectory())
      mod.app.use(Msa.express.static(staticDir))
  })
  // register module
  var key = mod.key
  if(key==='') Msa.mainMod = mod
  else {
    Msa.modules[key] = mod
    Msa.modulesRouter.use('/'+key, mod.app)
  }
}

const subApp_subApp = function(route) {
	var oSubApp = Msa.subApp()
	this.use(route, oSubApp)
	return oSubApp
}
/*
// partial

const Partial = Msa.Partial = class {
	constructor(htmlExpr) {
		formatHtml(htmlExpr, this)
	}
}

// shortcut function to server HTML content as partial
const subApp_getAsPartial = function(route, htmlExpr) {
//  var partial = Msa.formatHtml(htmlExpr)
	const partial = new Partial(htmlExpr)
	return this.get(route, function(req, res, next) {
//		res.partial = partial
		next(partial)
	})
}
*/

// utils

const { isArray: isArr } = Array

const { formatHtml } = Msa

Msa.joinUrl = function(...args){
	return args.join('/').replace(/\/+/g,'/')
}

const deepMerge = function(obj1, obj2) {
	for(let k in obj2) {
		if(typeof obj1[k] === "object" && typeof obj2[k] === "object")
			deepMerge(obj1[k], obj2[k])
		else obj1[k] = obj2[k]
	}
}

const fileExists = function(path) {
	return new Promise((ok, ko) => {
		try {
			fs.access(path, err => {
				ok(err ? false : true)
			})
		} catch(err) { return ko(err) }
	})
}

const tryResolve = function(name) {
	var res
	try {
		res = require.resolve(name)
	} catch(e) {}
	return res
}

// run main
main(err => {
	if(err) {
		console.error(err)
		process.exit(1)
	}
})
