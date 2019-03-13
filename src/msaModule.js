const exp = module.exports = {}

// require
const { promisify:prm } = require('util')
const { join, dirname } = require('path')
const fs = require('fs'),
	readFile = prm(fs.readFile),
	access = prm(fs.access)
const express = require("express")
const semver = require("semver")

// params
require('./params')

new Msa.Param("modules", {
	defVal: {}
})

// Msa modules

Msa.Modules = {}

exp.registerMsaModule = async function(key, obj) {
	// check if a mod has already been registered with the same key
	if(!Msa.Modules[key]) {
		// do register
		Msa.Modules[key] = obj
		return true
	}
	return false
}

exp.parseModDesc = function(desc) {
	let name = null, npmArg = null
	if(typeof desc === "object") {
		name = Object.keys(desc)[0]
		npmArg = desc[name]
		if(isVersionFormat(npmArg))
			npmArg = name + '@' + npmArg
	} else if(typeof desc === "string") {
		npmArg = desc
		name = desc
		let scoped = false
		if(name.indexOf('@') >= 0){
			const s = desc.split('@')
			name = (s[0]=="") ? ("@"+s[1]) : s[0]
			scoped = (s[0]=="")
		}
		if(!scoped && name.indexOf('/') >= 0){
			const s = desc.split('/'), n = s.length
			name = (s[n-1]=="") ? s[n-2] : s[n-1]
			// remove extension
			name = name.split('.')[0]
		}
	}
	return { name, npmArg }
}

exp.parsePackageFile = async function(name, kwargs) {
	let key=null, deps={}
	// do not use "resolve" to find module, as some may have no index.js
	const dir = await exp.tryResolveDir(name)
	// read && parse package.json
	const packFile = await tryReadFile(join(dir, "package.json"))
	const pack = packFile && JSON.parse(packFile)
	if(pack) {
		// check msa key (if provided)
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
			console.warn(`Msa module "${name}" installed as "${key}", whereas its msaKey set to "${pKey}" in its package.json file.`)
			return false
		}
	}
	return true
}

// return dirname of a given package name
exp.tryResolveDir = async function(name, kwargs){
	const dir = (kwargs && kwargs.dir) || Msa.dirname
	// require.resolve is the best way to find most of modules
	try {
		return dirname(require.resolve(name), { paths:[dir] })
	} catch(_) {}
	// for some msa modules without index.js, we must use this technique
	const path = join(dir, "node_modules", name)
	if(await fileExists(path))
		return path
	return null
}

Msa.tryResolve = function(key){
	const desc = Msa.Modules[key]
	if(!desc) return null
	try {
		return require.resolve(desc.name)
	} catch(_) {}
	return null
}
Msa.resolve = function(key){
	const path = Msa.tryResolve(key)
	if(!path) throw(`Msa module "${key}" not registered !`)
	return require.resolve(path)
}
Msa.tryRequire = function(key){
	try {
		return Msa.require(key)
	} catch(_) {}
	return null
}
Msa.require = function(key){
	const desc = Msa.Modules[key]
	if(!desc) throw(`Msa module "${key}" not registered !`)
	let mod = desc.mod
	if(!mod) {
		const path = Msa.resolve(key)
		mod = desc.mod = require(path)
	}
	return mod
}

Msa.Module = class {
	constructor() {
		this.app = Msa.subApp()
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


// msa module utils

Msa.joinUrl = function(...args){
	return args.join('/').replace(/\/+/g,'/')
}


// utils

async function tryReadFile(path) {
	let res = null
	try {
		res = await readFile(path)
	} catch(_) {}
	return res
}

async function fileExists(path) {
	try {
		await access(path)
	} catch(_) { return false }
	return true
}

function isVersionFormat(str) {
	return semver.coerce(str) !== null
}

