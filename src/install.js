// require
const { promisify:prm } = require('util')
const { join, dirname } = require('path')
const fs = require('fs'),
	access = prm(fs.access)
const { spawn } = require('child_process')
const readline = require('readline')

// depedencies that needs to wait first install
let com

const defaultAppMod = "../msa-app"

// install //////////////////////////////////

module.exports = async function({ mod=null, yes=false, force=false, itf=null } = {}){
	// default install interface
	if(!itf) itf = new Msa.InstallInterface({ yes, force })
	// first install (if needed)
	await firstInstall()
	// require installed dependencies
	com = require('./com')
	// install mod(s)
	if(mod)
		// case mod given in input
		await itf.installMsaMod(mod, { save:true })
	else {
		const mods = Msa.params.modules
		if(Object.keys(mods).length === 0) {
			// case: no module to install: propose default msa app modules
			if(await questionInstallDefaultMsaMod(itf))
				// user accepted: install mod & save param
				await itf.installMsaMod(defaultAppMod, { save:true })
		} else
			// case install msa modules
			for(let key in mods)
				await itf.installMsaMod(mods[key], { key })
	}
}

async function firstInstall() {
	if(! await fileExists(join(Msa.dirname, "node_modules")))
		await itf.exec("npm", ["install"], { cwd:Msa.dirname })
}

async function questionInstallDefaultMsaMod(itf) {
	const res = await itf.question({
		question: "Nothing to install. Would you like to install default Msa module app ?",
		choices: ["y", "n"],
		defVal: "y"
	})
	return (res === "y")
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
	return this.exec('npm', ...args)
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
	const { name, npmArg } = com.parseModDesc(desc)
	const dir = ( kwargs && kwargs.dir ) || Msa.dirname
	const path = await com.tryResolveDir(name, { dir })
	if(this.force || !path) {
		this.log(`### npm install ${npmArg}`)
		await this.exec('npm', ['install', npmArg], { cwd:dir })
	}
}

InstallInterfacePt.installMsaMod = async function(desc, kwargs){
	const pDesc = com.parseModDesc(desc),
		{ name, npmArg } = pDesc
	// prevent infinite loop
	if(this.installedMsaMods.indexOf(name) >= 0) return
	this.installedMsaMods.push(name)
	// npm install
	await this.install(desc, { npmArg, dir: Msa.dirname })
	// parse package.json file to get module key
	const { key, deps } = await com.parsePackageFile(name, kwargs)
	// register
	com.registerMsaModule(key, pDesc)
	// save as param, if requested
	if(kwargs && kwargs.save)
		await saveMsaModule(key, desc)
	// install msa dependencies
	// do it before exec msa_install.js, as it may require one of its deps
	for(let depKey in deps)
		await this.installMsaMod(deps[depKey], { key:depKey })
	// msa_install
	const dir = await com.tryResolveDir(name),
		msaInstallPath = tryResolve( join(dir, "msa_install") )
	if(msaInstallPath)
		await require(msaInstallPath)(this)
}

async function saveMsaModule(key, desc) {
	const modsParam = Msa.getParam("modules")
	Object.assign(modsParam, { [key]:desc })
	Msa.setParam("modules", modsParam)
}


// utils

const { isArray: isArr } = Array

async function fileExists(path) {
	try {
		await access(path)
	} catch(_) { return false }
	return true
}

function tryResolve(name, kwargs) {
	let res = null
	try {
		res = require.resolve(name, kwargs)
	} catch(_) {}
	return res
}

