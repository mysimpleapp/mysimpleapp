const com = module.exports = {}

if(global.Msa === undefined)
	global.Msa = global.MySimpleApp = {}

require('./params')
Object.assign(com, require('./msaModule'))

Msa.express = require('express')
Msa.bodyParser = require('body-parser')

Msa.OK = 200
Msa.BAD_REQUEST = 400
Msa.FORBIDDEN = 403
Msa.NOT_FOUND = 404
