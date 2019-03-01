// require
const { promisify:prm } = require('util')
const { join, dirname, basename } = require('path')
const fs = require('fs'),
	access = prm(fs.access)
	readFile = prm(fs.readFile),
	writeFile = prm(fs.writeFile)
const semver = require("semver")
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

// params
require('./params')

new Msa.Param("modules", {
	defVal: {}
})

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

const main = async function(){

	// get input args
	const argv = process.argv
	var action, mod, params=[], paramsFiles=[], yes=false, force=false
	for(let i=2; i<argv.length; ++i){
		arg = argv[i]
		if(arg==="-h" || arg==="--help") { console.log(help); return }
		else if(arg==="-p" || arg==="--params") params.push(argv[++i])
		else if(arg==="-pf" || arg==="--params-file") paramsFiles.push(argv[++i])
		else if(arg==="-y" || arg==="--yes") yes = true
		else if(arg==="-f" || arg==="--force") force = true
		else if(!action && arg[0]!=='-') action = arg
		else if(action && !mod && arg[0]!=='-') mod = arg
		else { console.error(`Unknown option ${arg}`); process.exit(1) }
	}

	// fill Msa.paramsFiles
	const noInputParamFile = (paramsFiles.length === 0)
	const defParamFile = join(__dirname, "msa_params.json")
	if(noInputParamFile || await fileExists(defParamFile))
		Msa.paramsFiles.push(defParamFile)
	for(let f of paramsFiles)
		Msa.paramsFiles.push(f)

	// fill Msa.params
	for(let f of Msa.paramsFiles){
		try {
			const p = await readFile(f)
			deepMerge(Msa.params, JSON.parse(p))
		} catch(err) {
			if(!noInputParamFile)
				console.warn(`Could not read or parse params file "${f}"`)
		}
	}
	for(let p of params)
		deepMerge(Msa.params, JSON.parse(p))

	// action
	if(!action || action == "install")
		await installMsa({ mod, yes, force })
	if(!action || action == "start")
		await startMsa()
}

// Msa modules

const MsaModules = {}

async function registerMsaModule(key, desc) {
	// check if a mod has already been registered with the same key
	if(!MsaModules[key]) {
		// do register
		MsaModules[key] = desc
		return true
	}
	return false
}

function parseModDesc(desc) {
	let name = null, npmArg = null
	if(typeof desc === "object") {
		name = Object.keys(desc)[0]
		npmArg = desc[name]
		if(isVersionFormat(npmArg))
			npmArg = name + '@' + npmArg
	} else if(typeof desc === "string") {
		npmArg = desc
		if(desc.indexOf('@') >= 0){
			name = desc.split('@')[0]
		} else {
			name = desc.split('/').pop().split('.')[0]
		}
	}
	return { name, npmArg }
}

async function parsePackageFile(name, kwargs) {
	let key=null, deps={}
	// read && parse package.json
	const path = require.resolve(name),
		dir = dirname(path)
	const packFile = await tryReadFile(join(dir, "package.json"))
	const pack = packFile && JSON.parse(packFile)
	if(pack) {
		// check msa key
		const iKey = kwargs && kwargs.key
		if(!iKey || checkKey(iKey, pack.msaKey, name)) {
			// get msa key
			key = pack.msaKey
			// get msa dependencies
			deps = pack.msaDependencies
		}
	} else
		console.warn(`Msa module "${name}" has no package.json file.`)
	return { key, deps }
}

function checkKey(key, pKey, name) {
	if(key !== "$app") {
		if(!pKey) {
			console.warn(`Msa module "${name}" has no msaKey defined in its package.json file.`)
			return false
		}
		if(key !== pKey) {
			console.warn(`Msa module "${name}" installed as "${key}", has its msaKey set to "${pKey}" in its package.json file.`)
			return false
		}
	}
	return true
}

Msa.tryResolve = function(key){
	const desc = MsaModules[key]
	if(!desc) return null
	try {
		return require.resolve(desc.name)
	} catch(e) {}
	return null
}
Msa.resolve = function(key){
	const path = Msa.tryResolve(key)
	if(!path) throw(`Msa module "${key}" not registered !`)
	return require.resolve(path)
}
Msa.tryRequire = function(key){
	const path = Msa.tryResolve(key)
	return path ? require(path) : null
}
Msa.require = function(key){
	return require(Msa.resolve(key))
}

Msa.Module = class {
	constructor(key) {
		this.key = key
		this.app = Msa.subApp()
	}
	init(key, dir) {
		// key
		this.key = key
		// static files
		this.dirname = dir
		if(this.checkStaticDir !== false){
			const staticDir = dir+"/static"
			fs.stat(staticDir, (err, stats) => {
				if(!err && stats && stats.isDirectory())
					this.app.use(Msa.express.static(staticDir))
			})
		}
		// use module
		Msa.modulesRouter.use('/'+key, this.app)
	}
}

Msa.subApp = function() {
	const oSubApp = express()
	oSubApp.subApp = subApp_subApp
	return oSubApp
}

function subApp_subApp(route) {
	var oSubApp = Msa.subApp()
	this.use(route, oSubApp)
	return oSubApp
}


// install //////////////////////////////////

const installMsa = async function({ mod=null, yes=false, force=false, itf=null } = {}){
	// default install interface
	if(!itf) itf = new Msa.InstallInterface({ yes, force })
	if(mod)
		// case mod given in input
		await itf.installMsaMod(mod, { save:true })
	else {
		const mods = Msa.params.modules
		if(Object.keys(mods).length === 0) {
			// case: no module to install: propose default msa app modules
			const res = await itf.question({
				question: "Nothing to install. Would you like to install default Msa module app ?",
				choices: ["y", "n"],
				defVal: "y"
			})
			if(res === "y") {
				// user accepted: install mod & save param
				const appMod = "../msa-app"
				await itf.installMsaMod(appMod, { save:true })
				await Msa.setParam("modules", Object.assign(mods, { "$app": appMod }))
			}
		} else
			// case install msa modules
			for(let key in mods)
				await itf.installMsaMod(mods[key], { key })
	}
}

// interface

Msa.InstallInterface = class {
	constructor({ yes=false, force=false } = {}){
		this.yes = yes
		this.force = force
		this.installedMsaMods = []
	}
}
const InstallInterfacePt = Msa.InstallInterface.prototype

InstallInterfacePt.log = function(...args){
	console.log(...args)
}

InstallInterfacePt.warn = function(...args){
	console.warn(...args)
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
				const rl = readline.createInterface({
					input: process.stdin,
					output: process.stdout
				})
				rl.question(formatQuestion(question)+" ", answer => {
					rl.close()
					if(answer==="" && question.defVal!==undefined) answer = question.defVal
					ok(answer)
				})
			}
		} catch(err) { return ko(err) }
	})
}

function formatQuestion(q) {
	// case type string
	if(typeof q === "string") return q
	// case type obj
	let res = q.question
	// choices
	if(q.choices !== undefined) {
		// defVal w/ choices
		if(q.defVal !== undefined) {
			const idx = q.choices.indexOf(q.defVal)
			if(idx >= 0) q.choices[idx] = `[${q.defVal}]`
		}
		res += ` (possible values: ${q.choices.join(' / ')} )`
	}
	// defVal w/o choices
	else if(q.defVal !== undefined)
		res += ` (default value: ${q.defVal} )`
	return res
}

InstallInterfacePt.questionParam = async function(arg){
	let res = null
	// select & format params to be questionned
	const args = isArr(arg) ? arg : [arg]
	let params = args.map(a => (typeof a === "string") ? { key:a } : a)
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
	return res
}

InstallInterfacePt.install = async function(desc, kwargs){
	const { name, npmArg } = parseModDesc(desc)
	const dir = ( kwargs && kwargs.dir ) || Msa.dirname
	var path = tryResolve(name, { paths:[dir] })
	if(this.force || !path) {
		const save = ( kwargs && kwargs.save ) || false,
			saveArg = save ? "--save" : "--no-save"
		this.log(`### npm install ${npmArg} ${saveArg}`)
		await this.exec('npm', ['install', npmArg, saveArg], { cwd:dir })
	}
}

InstallInterfacePt.installMsaMod = async function(desc, kwargs){
	const pDesc = parseModDesc(desc),
		{ name, npmArg } = pDesc
	// prevent infinite loop
	if(this.installedMsaMods.indexOf(name) >= 0) return
	this.installedMsaMods.push(name)
	// npm install
	await this.install(desc, { npmArg, dir: Msa.dirname })
	// parse package.json file to get module key
	const { key, deps } = await parsePackageFile(name, kwargs)
	// register
	registerMsaModule(key, pDesc)
	// save as param, if requested
	if(kwargs && kwargs.save)
		Msa.setParam(`modules.${key}`, desc)
	// install msa dependencies
	// do it before exec msa_install.js, as it may require one of its deps
	for(let depKey in deps)
		await this.installMsaMod(deps[depKey], { key:depKey })
	// msa_install
	const dir = dirname(Msa.resolve(key)),
		msaInstallPath = tryResolve( join(dir, "msa_install") )
	if(msaInstallPath)
		await require(msaInstallPath)(this)
}
/*
async function parseMsaDependencies(itf, msaDeps, dir) {
	const res = {}
	for(let key in msaDeps) {
		const desc = msaDeps[key]
		let name, version, path
		if(typeof desc === "object") {
			name = Object.keys(desc)[0]
			version = desc[name]
		} else if(typeof desc === "string") {
			if(desc.indexOf("@") !== -1) {
				name = desc.split("@")[0]
				version = desc.split("@")[1]
			} else if(await fileExists(join(dir, desc))) {
				name = basename(desc)
				path = join(dir, desc)
			} else {
				name = desc
			}
		}
		if(!name) itf.log(`Could not deduce dependency name of Msa module "${key}" from "${desc}"`)
		else res[key] = { name, version, path }
	}
	return res
}
*/
// start //////////////////////////////////

const startMsa = async function() {
	// create modules router
	Msa.modulesRouter = express.Router()
	// start msa modules
	const modules = Msa.params.modules
	for(let key in modules)
		await Msa.start(key, modules[key])
	// create msa router
	const msaMod = new Msa.Module("msa")
	msaMod.init("msa", __dirname)
	// require msa modules 
	for(let key in Msa.modules){
		const modDir = Msa.resolve(key),
			mod = Msa.require(key)
		mod.init(key, modDir)
	}
	// use main moduke
	Msa.app = Msa.require("$app").app
	// start server
	startServer()
}

const startedMods = {}
Msa.start = async function(key, desc){
	// prevent infinite loop
	let res = startedMods[key]
	if(res !== undefined) return res
	res = startedMods[key] = null
	// register msa module
	const pDesc = parseModDesc(desc),
		{ name } = pDesc
	registerMsaModule(key, pDesc)
	// exec dependencies start before
	const { deps } = await parsePackageFile(name, { key })
	for(let depKey in deps)
		await Msa.start(depKey, deps[depKey])
	// exec msa_start.js (if any)
	const path = Msa.resolve(key),
		dir = dirname(path),
		msaStartPath = tryResolve( join(dir, "msa_start") )
	if(msaStartPath) {
		const msaStartPrm = require(msaStartPath)
		res = await msaStartPrm()
		if(res !== undefined) startedMods[key] = res
	}
	return res
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



// utils

const { isArray: isArr } = Array

const { formatHtml } = Msa

Msa.joinUrl = function(...args){
	return args.join('/').replace(/\/+/g,'/')
}

function deepMerge(obj1, obj2) {
	for(let k in obj2) {
		if(typeof obj1[k] === "object" && typeof obj2[k] === "object")
			deepMerge(obj1[k], obj2[k])
		else obj1[k] = obj2[k]
	}
}

async function fileExists(path) {
	try {
		await access(path)
	} catch(_) { return false }
	return true
}

async function tryReadFile(path) {
	let res = null
	try {
		res = await readFile(path)
	} catch(_) {}
	return res
}

function tryResolve(name, kwargs) {
	let res = null
	try {
		res = require.resolve(name, kwargs)
	} catch(_) {}
	return res
}

function isVersionFormat(str) {
	return semver.coerce(str) !== null
}

// run main
main()
	.catch(err => {
		console.error(err)
		process.exit(1)
	})
