const com = module.exports = {}

require('./params')
require('./htmlExpr')
Object.assign(com, require('./msaModule'))

Msa.express = require('express')
Msa.bodyParser = require('body-parser')

Msa.OK = 200
Msa.FORBIDDEN = 403
Msa.NOT_FOUND = 404
