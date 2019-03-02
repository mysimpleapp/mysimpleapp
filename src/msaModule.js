const exp = module.exports = {}

// require
const { promisify:prm } = require('util')
const { join, dirname } = require('path')
const fs = require('fs'),
	readFile = prm(fs.readFile)
const express = require("express")
const semver = require("semver")

// params
require('./params')

new Msa.Param("modules", {
	defVal: {}
})

// Msa modules

const MsaModules = {}

exp.registerMsaModule = async function(key, desc) {
	// check if a mod has already been registered with the same key
	if(!MsaModules[key]) {
		// do register
		MsaModules[key] = desc
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
		if(desc.indexOf('@') >= 0){
			name = desc.split('@')[0]
		} else {
			name = desc.split('/').pop().split('.')[0]
		}
	}
	return { name, npmArg }
}

exp.parsePackageFile = async function(name, kwargs) {
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

function isVersionFormat(str) {
	return semver.coerce(str) !== null
}

