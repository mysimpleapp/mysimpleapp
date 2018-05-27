// require
const { join, normalize } = require('path')
const fs = require('fs')
const express = require('express')
//var fs = require('fs')
//var sh = require('shelljs')
//const glob = require('glob')

// global Msa object
global.Msa = global.MySimpleApp = {}
Msa.dirname = normalize(join(__dirname,".."))
//Msa.compsDir = Msa.dirname+'/bower_components'
//Msa.compsUrl = "/bower_components"
Msa.express = express

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
    db: "msa_nedb"
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

  if(start){
    startMsa()
  }
}


// start

var startMsa = function() {
  Msa.app = express()
  Msa.modulesRouter = express.Router()
  Msa.app.use(Msa.modulesRouter)
  requireMsaModules()
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
  mod.app = express()
  mod.app.getAsPartial = getAsPartial
  // register new module
  Msa.modules[route] = mod
  Msa.modulesRouter.use('/'+route, mod.app)
  return mod
}

Msa.require = function(route){
  var modDir = join(Msa.dirname, "msa_modules", Msa.params.modules[route])
  return require(modDir)
}

var requireMsaModules = function() {
  var modules = Msa.params.modules 
  for(let route in modules){
    let modDir = join(Msa.dirname, "msa_modules", modules[route]),
        mod = require(modDir)
    if(route === "main") Msa.app.use(mod.app)
    let staticDir = modDir+"/static"
    fs.stat(staticDir, (err, stats) => {
      if(!err && stats && stats.isDirectory())
        mod.app.use(Msa.express.static(staticDir))
    })
  }
}

// shortcut function to server HTML content as partial
var getAsPartial = function(route, htmlExpr) {
  var partial = Msa.formatHtml(htmlExpr)
  return this.get(route, function(req, res, next) {
    res.partial = partial
    next()
  })
}

main()
