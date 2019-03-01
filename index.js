// require
const { promisify:prm } = require('util')
const { join } = require('path')
const fs = require('fs'),
	access = prm(fs.access)
	readFile = prm(fs.readFile)

// global Msa object
global.Msa = global.MySimpleApp = {}
Msa.dirname = __dirname
Msa.paramsFiles = []

// params
require('./src/params')

// main //////////////////////

const help =
`Script to install or start a MySimpleApp server

Usage: node ${process.argv[1]} [ACTION] [MODULE] [OPTIONS]

  ACTION: "install" or "start". If not provided, both actions will be executed.

  MODULE (install only): module to install. If not provided, all modules are installed.

  OPTIONS:
    -p/--params: MSA parameters (JSON format)
    -pf/--params-file: Path to file containing MSA parameters (JSON format, default: "msa_params.json")
    -y/--yes (install only): Automatically reply with default value to all questions
    -f/--force (install only): Force re-intall, already installed modules`

const main = async function(){

	// get input args
	const argv = process.argv
	var action, mod, params=[], paramsFiles=[], yes=false, force=false
	for(let i=2; i<argv.length; ++i){
		arg = argv[i]
		if(arg==="-h" || arg==="--help") { console.log(help); return }
		else if(arg==="-p" || arg==="--params") params.push(argv[++i])
		else if(arg==="-pf" || arg==="--params-file") paramsFiles.push(argv[++i])
		else if(arg==="-y" || arg==="--yes") yes = true
		else if(arg==="-f" || arg==="--force") force = true
		else if(!action && arg[0]!=='-') action = arg
		else if(action && !mod && arg[0]!=='-') mod = arg
		else { console.error(`Unknown option ${arg}`); process.exit(1) }
	}

	// fill Msa.paramsFiles
	const noInputParamFile = (paramsFiles.length === 0)
	const defParamFile = join(__dirname, "msa_params.json")
	if(noInputParamFile || await fileExists(defParamFile))
		Msa.paramsFiles.push(defParamFile)
	for(let f of paramsFiles)
		Msa.paramsFiles.push(f)

	// fill Msa.params
	for(let f of Msa.paramsFiles){
		try {
			const p = await readFile(f)
			deepMerge(Msa.params, JSON.parse(p))
		} catch(err) {
			if(!noInputParamFile)
				console.warn(`Could not read or parse params file "${f}"`)
		}
	}
	for(let p of params)
		deepMerge(Msa.params, JSON.parse(p))

	// action
	if(!action || action == "install")
		await require('./src/install')({ mod, yes, force })
	if(!action || action == "start")
		await require('./src/start')()
}


// utils

function deepMerge(obj1, obj2) {
	for(let k in obj2) {
		if(typeof obj1[k] === "object" && typeof obj2[k] === "object")
			deepMerge(obj1[k], obj2[k])
		else obj1[k] = obj2[k]
	}
}

async function fileExists(path) {
	try {
		await access(path)
	} catch(_) { return false }
	return true
}

// run main
main()
	.catch(err => {
		console.error(err)
		process.exit(1)
	})
