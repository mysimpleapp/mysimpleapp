const { promisify:prm } = require('util')
const fs = require('fs'),
	readFile = prm(fs.readFile),
	writeFile = prm(fs.writeFile)

// default params
Msa.params = {
  log_level: 'DEBUG',
  server: {
    port: "dev",
    https: {
      activated: false
    }
  }
}

Msa.paramDefs = {}

Msa.Param = class {
	constructor(key, kwargs){
		this.key = key
		Object.assign(this, kwargs)
		// register
		Msa.paramDefs[this.key] = this
		// init value
		this.init()
	}
}
const ParamPt = Msa.Param.prototype

ParamPt.init = function() {
	if(this.get() === undefined && this.defVal !== undefined)
		this.set(this.defVal, { save: false })
}

ParamPt.get = function() {
	return getDeep(Msa.params, this.key)
}

ParamPt.set = async function(val, kwargs) {
	this.val = val
	setDeep(Msa.params, this.key, val)
	if(!kwargs || kwargs.save !== false)
		await this.save()
}

ParamPt.save = function() {
	ParamSaveStack = ParamSaveStack.then(() => {
		return new Promise(async (ok, ko) => {
			try {
				const paramsFiles = Msa.paramsFiles,
					path = paramsFiles && paramsFiles[0]
				if(!path) throw "No params file to save in."
				let params = {}
				try {
					params = JSON.parse(await readFile(path))
				} catch(err) {}
				const { key, val } = this
				setDeep(params, key, val)
				await writeFile(path, JSON.stringify(params, null, 2))
			} catch(err) { return ko(err) }
			ok()
		})
	})
}
let ParamSaveStack = Promise.resolve()

Msa.getParam = function(key) {
	return getDeep(Msa.params, key)
}

Msa.setParam = async function(key, val, kwargs) {
	const def = Msa.paramDefs[key]
	if(def) await def.set(val, kwargs)
	else setDeep(Msa.params, key, val)
}

function getDeep(obj, key){
	const keys = key.split('.')
	for(let k of keys){
		obj = obj[k]
		if(obj===undefined) return
	}
	return obj
}

function setDeep(obj, key, val) {
	const keys = key.split('.'), len = keys.length
	for(let i=0; i<len-1; ++i){
		let k = keys[i], obj2 = obj[k]
		if(obj2 === undefined)
			obj2 = obj[k] = {}
		obj = obj2
	}
	obj[keys[len-1]] = val
}
