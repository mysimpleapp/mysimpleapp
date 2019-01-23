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

ParamPt.set = function(val, kwargs) {
	this.val = val
	setDeep(Msa.params, this.key, val)
	if(!kwargs || kwargs.save !== false)
		this.save()
}

ParamPt.save = function() {
	ParamSaveStack = ParamSaveStack.then(() => {
		return new Promise(async (ok, ko) => {
			try {
				const paramFile = Msa.paramsFile[0]
				if(!paramFile) throw "No params file to save in."
				const params = JSON.parse(await readFile(paramsFile))
				const key = this.key, val = this.val
				setDeep(params, key, val)
				await writeFile(paramsFile, JSON.stringify(params, null, 2))
			} catch(err) { return ko(err) }
			ok()
		})
	})
}
let ParamSaveStack = Promise.resolve()

Msa.getParam = function(key) {
	return getDeep(Msa.params, key)
}

Msa.setParam = function(key, val, kwargs) {
	const def = Msa.paramDefs[key]
	if(def) def.set(val, kwargs)
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
