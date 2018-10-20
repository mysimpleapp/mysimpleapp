// require 2
const { join } = require('path')
const fs = require('fs')
const { promosify:prm } = require('util')
const { spawn } = require('child_process')
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
		var action, mod, params, paramsFile, yes=false, force=false
		for(let i=2; i<argv.length; ++i){
			arg = argv[i]
			if(arg==="-h" || arg==="--help") { console.log(help); return next() }
			else if(arg==="-p" || arg==="--params") params = argv[++i]
			else if(arg==="-pf" || arg==="--params-file") paramsFile = argv[++i]
			else if(arg==="-y" || arg==="--yes") yes = true
			else if(arg==="-f" || arg==="--force") force = true
			else if(!action && arg[0]!=='-') action = arg
			else if(action && !mod && arg[0]!=='-') mod = arg
			else { console.error(`Unknown option ${arg}`); process.exit(1) }
		}

		// fill params, if provided
		if(!params){
			const defParamsFile = join(__dirname, "msa_params.json")
			if(!paramsFile && await fileExists(defParamsFile))
				paramsFile = defParamsFile
			if(paramsFile)
				params = fs.readFileSync(paramsFile)
		}
		if(params) deepMerge(Msa.params, JSON.parse(params))

		// action
		if(!action || action == "install")
			await installMsa({ mod, yes, force })
		if(!action || action == "start")
			await startMsa()

	} catch(err) { next(err) }
	next()
}

// params /////////////////////////

// default params
Msa.params = {
  server: {
    port: "dev",
    https: {
      activated: false
    }
  }
}

Msa.paramsDescs = {}

Msa.registerParam = function(arg1, arg2){
	const targ1 = typeof arg1
	if(targ1 == "string")
		_registerParam(arg1, arg2)
	else if(targ1 == "object")
		for(let key in arg1)
			_registerParam(key, arg1[key])
}
const _registerParam = function(key, desc){
	Msa.paramsDescs[key] = desc
}

Msa.getParam = function(key){
	const keys = key.split('.')
	var obj = Msa.params
	for(let k of keys){
		obj = obj[k]
		if(obj===undefined) return undefined
	}
	return obj
}

Msa.setParam = function(key, val){
	const keys = key.split('.'), len = keys.length
	var obj = Msa.params
	for(let i=0; i<len-1; ++i){
		let obj2 = obj[k]
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
			const mods = mod ? [mod] : Object.values(Msa.params.modules)
			if(!itf) itf = new Msa.InstallInterface({ yes:yes, force:force })
			for(let m of mods){
				await itf.install(m)
			}
		} catch(err) { ko(err) }
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

InstallInterfacePt.question = function(...args){
	return new Promise(async (ok, ko) => {
		try {
			if(args.length > 1) {
				var res = []
				for(var arg of args)
					res.push( await this.question(arg) )
				ok(res)
			} else {
				var arg = args[0]
				if(typeof arg === "string") arg = { question: arg }
				var question = arg.question
				if(arg.defVal !== undefined) question += ` (default value: ${arg.defVal} )`
				if(arg.choices !== undefined) question += ` (possible values: ${arg.choices.join(' / ')} )`
				const rl = readline.createInterface({
					input: process.stdin,
					output: process.stdout
				})
				rl.question(question +' ', answer => {
					rl.close()
					ok(answer)
				})
			}
		} catch(err) { return ko(err) }
	})
}

InstallInterfacePt.questionParam = function(...args){
	return new Promise(async (ok, ko) => {
		var res
		try {
			let questions = []
			for(let arg of args) {
				if(typeof arg === "string") arg = { key:arg }
				const paramKey = arg.key, paramDesc = Msa.ParamsDescs[paramKey]
				const question = arg.question || `Choose a value for this parameter "${paramKey}"`
				const { choices, defVal } = Object.assign(arg, paramDesc)
				questions.push({ question, choices, defVal })
			}
			res = await this.question(...questions)
		} catch(err) { return ko(err) }
		ok(res)
	})
}

InstallInterfacePt.install = function(modName, kwargs){
	return new Promise(async (ok, ko) => {
		try {
			// check that this module has not already been installed by this itf (to avoid infinite loop)
			if(this.installedMods.indexOf(modName) > -1) return ok()
			this.installedMods.push(modName)
			// npm install
			const modPath = require.resolve(modName)
			if(this.force || ! await fileExists(modPath)) {
				this.log(`### install "${modName}"`)
				this.exec('npm', ['install', modName], kwargs)
			}
			// msa_install
			const msaInstallPath = join(modPath, "msa_install")
			var msaInstallFun = tryRequire(msaInstallPath)
			if(msaInstallFun) await prm(msaInstallFun(this))
		} catch(err) { return ko(err) }
		ok()
	})
}

// start //////////////////////////////////

const startMsa = function() {
	return new Promise((ok, ko) => {
		try {
			// create modules router
			Msa.preRouter = express()
			Msa.modulesRouter = express.Router()
			// create msa router
			var msaMod = Msa.module("msa")
			initMsaModule(msaMod, __dirname)
			// require msa modules 
			requireMsaModules()
			// use main moduke
			Msa.app = Msa.mainMod.app
			// start server
			startServer()
		} catch(err) { ko(err) }
		ok()
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
Msa.module = function(route, args) {
  // create new module
  var mod = {}
  mod.route = route
  // create sub app
  mod.app = Msa.subApp()
  return mod
}

Msa.subApp = function() {
	var oSubApp = express()
	oSubApp.getAsPartial = subApp_getAsPartial
	oSubApp.subApp = subApp_subApp
	return oSubApp
}

Msa.require = function(route){
  var modDir = join(Msa.dirname, "node_modules", Msa.params.modules[route])
  return require(modDir)
}

var requireMsaModules = function() {
  var modules = Msa.params.modules 
  for(let route in modules){
    let modDir = join(Msa.dirname, "node_modules", modules[route]),
        mod = require(modDir)
    initMsaModule(mod, modDir)
  }
}

var initMsaModule = function(mod, modDir) {
  // static files
  mod.dirname = modDir
  var staticDir = modDir+"/static"
  fs.stat(staticDir, (err, stats) => {
    if(!err && stats && stats.isDirectory())
      mod.app.use(Msa.express.static(staticDir))
  })
  // register module
  var route = mod.route
  if(route==='') Msa.mainMod = mod
  else {
    Msa.modules[route] = mod
    Msa.modulesRouter.use('/'+route, mod.app)
  }
}

// shortcut function to server HTML content as partial
const subApp_getAsPartial = function(route, htmlExpr) {
  var partial = Msa.formatHtml(htmlExpr)
  return this.get(route, function(req, res, next) {
    res.partial = partial
    next()
  })
}

const subApp_subApp = function(route) {
	var oSubApp = Msa.subApp()
	this.use(route, oSubApp)
	return oSubApp
}

// utils

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
		} catch(err) { ko(err) }
	})
}

const tryRequire = function(name) {
	var res
	try {
		res = require(name)
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
