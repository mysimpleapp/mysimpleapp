const numCPUs = 1

module.exports = async function () {
	if (cluster.isMaster) {
		console.log(`Master ${process.pid} is running`)
		for (let i = 0; i < numCPUs; i++) {
			cluster.fork()
		}
		cluster.on('exit', (worker, code, signal) => {
			console.log(`worker ${worker.process.pid} died`);
			cluster.fork()
		})
	} else {
		await startInstance()
	}
}

async function startInstance() {
	// create modules router
	Msa.modulesRouter = Msa.express.Router()
	// start msa modules
	const modules = Msa.params.modules
	for (let key in modules)
		await Msa.start(key, modules[key])
	// create "msa" module
	const msaMod = new Msa.Module()
	Msa.Modules["msa"] = {
		name: "msa",
		msaMod
	}
	await initMsaMod("msa", msaMod, Msa.dirname)
	// use main module
	const mainMod = Msa.require("$app").msaMod
	Msa.app = mainMod.app
	// start server
	startServer()
}

async function initMsaMod(key, mod, dir) {
	mod.msaKey = key
	// static files
	if (mod.checkStaticDir !== false) {
		const staticDir = join(dir, "static")
		if (await fileExists(staticDir))
			mod.app.use(Msa.express.static(staticDir))
	}
	// use module
	Msa.modulesRouter.use('/' + key, mod.app)
}

const startedMods = {}
Msa.start = async function (key, desc) {
	// prevent infinite loop
	let res = startedMods[key]
	if (res !== undefined) return res
	res = startedMods[key] = null
	// register msa module (as it may be needed by some startMsaModule)
	const { shortName } = com.parseModDesc(desc),
		dir = await com.resolveDir(shortName),
		{ name, deps } = await com.parsePackageFile(dir, { key })
	com.registerMsaModule(key, { name, dir })
	// start dependencies before
	for (let depKey in deps)
		await Msa.start(depKey, deps[depKey])
	// require msa module (or create it in case module has no index.js)
	const mod = Msa.tryRequire(key)
	let msaMod
	if (mod.startMsaModule) {
		msaMod = await asPrm(mod.startMsaModule())
	} else {
		msaMod = new Msa.Module()
	}
	mod.msaMod = msaMod
	// init
	await initMsaMod(key, msaMod, dir)
	return res
}

var startServer = function () {
	var paramsServer = Msa.params.server,
		isHttps = paramsServer.https.activated
	// create server
	if (isHttps) {
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
	if (port == "dev") port = isHttps ? 8443 : 8080
	if (port == "prd") port = isHttps ? 81 : 80
	// start server
	server.listen(port)
	// log
	var prot = isHttps ? "https" : "http"
	console.log(`Worker ${process.pid} started`)
	console.log("Server ready: " + prot + "://localhost:" + port + "/")
}



// utils

const { promisify: prm } = require('util')
const { join, dirname } = require('path')
const fs = require('fs'),
	access = prm(fs.access)
const cluster = require('cluster')
const com = require('./com')

function tryResolve(name, kwargs) {
	let res = null
	try {
		res = require.resolve(name, kwargs)
	} catch (_) { }
	return res
}

async function fileExists(path) {
	try {
		await access(path)
	} catch (_) { return false }
	return true
}

function asPrm(a) {
	if (typeof a === "object" && a.then) return a
	return new Promise((ok, ko) => ok(a))
}
