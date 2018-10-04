// require 2
const { join } = require('path')
const fs = require('fs')
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

// params
Msa.params = {
  server: {
    port: "dev",
    https: {
      activated: false
    }
  },
  modules: {
//    main: "msa_main",
    main: "drawmygame",
    db: "msa-nedb",
    user: "msa-user",
    fs: "msa-fs",
    admin: "msa-admin",
    utils: "msa-utils"
  }
}


// main

var main = function(){
  // get opt
  var opt = require('node-getopt').create([
    ['' , 'start'                , 'Start server.'],
    ['' , 'port=PORT'            , 'Server port.']
  ])
  .bindHelp()
  .parseSystem()

  var opts = opt.options,
    start = opts.start
  if(opts.port) Msa.params.server.port = opts.port

  if(start === undefined) start = true
  if(start){
    startMsa()
  }
}


// start

var startMsa = function() {
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

main()
