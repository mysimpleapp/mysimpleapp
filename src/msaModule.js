const exp = module.exports = {}

// require
const { promisify: prm } = require('util')
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

exp.registerMsaModule = async function (key, obj) {
	// check if a mod has already been registered with the same key
	if (!Msa.Modules[key]) {
		// do register
		Msa.Modules[key] = obj
		return true
	}
	return false
}

exp.parseModDesc = function (desc) {
	let name = null, npmArg = null
	if (typeof desc === "object") {
		name = Object.keys(desc)[0]
		npmArg = desc[name]
		if (isVersionFormat(npmArg))
			npmArg = name + '@' + npmArg
	} else if (typeof desc === "string") {
		npmArg = desc
		name = desc
		let scoped = false
		if (name.indexOf('@') >= 0) {
			const s = desc.split('@')
			name = (s[0] == "") ? ("@" + s[1]) : s[0]
			scoped = (s[0] == "")
		}
		if (!scoped && name.indexOf('/') >= 0) {
			const s = desc.split('/'), n = s.length
			name = (s[n - 1] == "") ? s[n - 2] : s[n - 1]
			// remove extension
			name = name.split('.')[0]
		}
	}
	return { shortName: name, npmArg }
}

exp.parsePackageFile = async function (dir, kwargs) {
	let name = null, key = null, deps = {}
	// read && parse package.json
	const packFile = await tryReadFile(join(dir, "package.json"))
	const pack = packFile && JSON.parse(packFile)
	if (pack) {
		// check msa key (if provided)
		const iKey = kwargs && kwargs.key
		if (!iKey || checkKey(iKey, pack.msaKey, name)) {
			name = pack.name
			key = pack.msaKey
			deps = pack.msaDependencies
		}
	} else
		console.warn(`There is no package.json file in this directory: ${dir}`)
	return { name, key, deps }
}

function checkKey(key, pKey, name) {
	if (key !== "$app") {
		if (!pKey) {
			console.warn(`Msa module "${name}" has no msaKey defined in its package.json file.`)
			return false
		}
		if (key !== pKey) {
			console.warn(`Msa module "${name}" installed as "${key}", whereas its msaKey set to "${pKey}" in its package.json file.`)
			return false
		}
	}
	return true
}

// return dirname of a given package name
exp.tryResolveDir = async function (shortName, kwargs) {
	const dir = (kwargs && kwargs.dir) || Msa.dirname
	// require.resolve is the best way to find most of modules
	try {
		return dirname(require.resolve(shortName), { paths: [dir] })
	} catch (_) { }
	// for some msa modules without index.js, we must use this technique
	let path = join(dir, "node_modules", shortName)
	if (await fileExists(path)) return path
	path = join(dir, "node_modules/@mysimpleapp", shortName) // TODO: make this generic to any scope
	if (await fileExists(path)) return path
	return null
}

exp.resolveDir = async function (shortName, kwargs) {
	const dir = await exp.tryResolveDir(shortName, kwargs)
	if (!dir) throw `ERROR: Could not resolve directory of ${shortName}`
	return dir
}

function isModuleNotFoundError(err) {
	return err.toString().startsWith('Error: Cannot find module')
}

Msa.tryResolve = function (key) {
	try {
		return Msa.resolve(key)
	} catch (err) {
		if (isModuleNotFoundError(err)) {
			return null
		} else throw err
	}
	return null
}
Msa.resolve = function (path) {
	const idx = path.indexOf("/")
	const key = (idx > 0) ? path.substr(0, idx) : path
	const subPath = (idx > 0) ? path.substr(idx) : ""
	const desc = Msa.Modules[key]
	if (!desc) throw (`Msa module "${key}" not registered !`)
	return require.resolve(desc.dir + subPath)
}
Msa.tryRequire = function (key) {
	try {
		return Msa.require(key)
	} catch (err) {
		if (isModuleNotFoundError(err)) {
			return null
		} else throw err
	}
	return null
}
Msa.require = function (path) {
	// case: modules without index.js
	const mod = (path.indexOf('/') < 0) && Msa.Modules[path] && Msa.Modules[path].mod
	if (mod) return mod
	// normal case
	const realPath = Msa.resolve(path)
	return require(realPath)
}

Msa.Module = class {
	constructor() {
		this.app = Msa.subApp()
	}
}

Msa.subApp = function () {
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

Msa.joinUrl = function (...args) {
	return args.join('/').replace(/\/+/g, '/')
}


// utils

async function tryReadFile(path) {
	let res = null
	try {
		res = await readFile(path)
	} catch (_) { }
	return res
}

async function fileExists(path) {
	try {
		await access(path)
	} catch (_) { return false }
	return true
}

function isVersionFormat(str) {
	return semver.coerce(str) !== null
}

