module.exports = async function() {
	// create modules router
	Msa.modulesRouter = Msa.express.Router()
	// call msa modules msa_start.js
	const modules = Msa.params.modules
	for(let key in modules)
		await Msa.start(key, modules[key])
	// create "msa" module
	const msaMod = new Msa.Module()
	Msa.Modules["msa"] = {
		name: "msa",
		mod: msaMod
	}
	initMsaMod("msa", msaMod, Msa.dirname)
	// require msa modules 
	for(let key in modules){
		// get name of module
		const desc = Msa.Modules[key]
		if(!desc) {
			console.warn(`Msa module "${key}" not installed.`)
			continue
		}
		const { name } = desc
		// determine dir of module
		const dir = await com.tryResolveDir(name)
		// require module (or create it in case module has no index.js)
		let mod = Msa.tryRequire(key)
		if(!mod)
			mod = desc.mod = new Msa.Module()
		// init
		initMsaMod(key, mod, dir)
	}
	// use main moduke
	Msa.app = Msa.require("$app").app
	// start server
	startServer()
}

function initMsaMod(key, mod, dir) {
	mod.msaKey = key
	// static files
	if(mod.checkStaticDir !== false){
		const staticDir = join(dir, "static")
		fs.stat(staticDir, (err, stats) => {
			if(!err && stats && stats.isDirectory())
				mod.app.use(Msa.express.static(staticDir))
			})
	}
	// use module
	Msa.modulesRouter.use('/'+key, mod.app)
}

const startedMods = {}
Msa.start = async function(key, desc){
	// prevent infinite loop
	let res = startedMods[key]
	if(res !== undefined) return res
	res = startedMods[key] = null
	// register msa module (as it may be needed by some msa_start.js)
	const pDesc = com.parseModDesc(desc),
		{ name } = pDesc
	com.registerMsaModule(key, pDesc)
	// exec dependencies msa_start.js before
	const { deps } = await com.parsePackageFile(name, { key })
	for(let depKey in deps)
		await Msa.start(depKey, deps[depKey])
	// exec msa_start.js (if any)
	const dir = await com.tryResolveDir(name),
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

const { join, dirname } = require('path')
const fs = require('fs')
const com = require('./com')

function tryResolve(name, kwargs) {
	let res = null
	try {
		res = require.resolve(name, kwargs)
	} catch(_) {}
	return res
}

