const com = module.exports = {}

require('./params')
require('./htmlExpr')
Object.assign(com, require('./msaModule'))

Msa.express = require('express')
Msa.bodyParser = require('body-parser')

