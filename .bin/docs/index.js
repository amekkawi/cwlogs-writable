var fs = require('fs');
var path = require('path');
var minimist = require('minimist');
var jsdocParse = require('jsdoc-parse');
var jsdocApi = require('jsdoc-api');
var dmd = require('dmd');

var cliArgs = minimist(process.argv.slice(2), {
	'--': false,
	boolean: ['unified', 'protected', 'private', 'overwrite'],
	string: ['readme']
});

var SYNTAX = 'SYNTAX: node ' + path.relative(process.cwd(), process.argv[1])
	+ '[--readme=("README"|"CHANGELOG")|--unified] [--protected|--private] [--overwrite] <output-path>\n';

var outputPath = cliArgs._[0];
var overwrite = cliArgs.overwrite;
var unifiedOutput = cliArgs.unified;
var projectREADME = cliArgs.readme;
var includeProtected = cliArgs.protected || cliArgs.private;
var includePrivate = cliArgs.private;

var baseOptions = {
	files: path.join(__dirname, '../../lib/*.js')
};

if (includePrivate) {
	baseOptions.private = true;
}

if (projectREADME && !String(projectREADME).match(/^(README|CHANGELOG)$/)) {
	process.stderr.write('--readme must be "README" or "CHANGELOG"\n' + SYNTAX);
	process.exit(1);
}

if (!outputPath) {
	process.stderr.write('Missing <output-path>\n' + SYNTAX);
	process.exit(1);
}

main();

function main() {
	var options = Object.assign({}, baseOptions);
	checkOutputPath()
		.then(function(stat) {
			if (!projectREADME && !unifiedOutput) {
				if (stat && stat.isDirectory()) {
					return removeOutputDir();
				}
				else if (!stat) {
					return new Promise(function(resolve, reject) {
						fs.mkdir(outputPath, function(err) {
							if (err) {
								err.message = 'Failed to make <output-path> dir -- ' + err.message;
								reject(err);
							}
							else {
								resolve();
							}
						});
					});
				}
			}
		})
		.then(function() {
			return getPackageVersion()
				.then(function(packageVersion) {
					process.env.DOCS_PACKAGE_VERSION = packageVersion;
				});
		})
		.then(function() {
			return getTemplateData(options)
				.then(filterTemplateData)
				.then(function(templateData) {
					if (projectREADME) {
						return buildProjectREADME(projectREADME, templateData, options);
					}
					else if (unifiedOutput) {
						return buildUnified(templateData, options);
					}
					else {
						return buildSplit(templateData, options);
					}
				});
		}, function(err) {
			process.stderr.write(err.message + '\n' + SYNTAX);
			process.exitCode = 1;
		})
		.catch(function(err) {
			process.stderr.write(err.stack + '\n');
			process.exitCode = 1;
		});
}

function checkOutputPath() {
	return new Promise(function(resolve, reject) {
		fs.stat(outputPath, function(err, stat) {
			if (err) {
				if (err.code === 'ENOENT') {
					resolve(stat);
				}
				else {
					err.message = 'Failed to stat <output-path> -- ' + err.message;
					reject(err);
				}
			}
			else if (!overwrite) {
				reject(new Error('<output-path> already exists'));
			}
			else if ((unifiedOutput || projectREADME) && !stat.isFile()) {
				reject(new Error('<output-path> exists and is not a file'));
			}
			else if (!unifiedOutput && !projectREADME && !stat.isDirectory()) {
				reject(new Error('<output-path> exists and is not a directory'));
			}
			else {
				resolve(stat);
			}
		});
	});
}

function getPackageVersion() {
	return new Promise(function(resolve, reject) {
		fs.readFile(path.join(__dirname, '../../package.json'), { encoding: 'utf8' }, function(err, data) {
			if (err) {
				reject(err);
			}
			else {
				resolve(data);
			}
		})
	})
		.then(function(data) {
			return JSON.parse(data);
		})
		.then(function(packageJSON) {
			return packageJSON && packageJSON.version;
		});
}

function removeOutputDir() {
	return new Promise(function(resolve, reject) {
		fs.readdir(outputPath, function(err, files) {
			if (err) {
				reject(err);
			}
			else {
				resolve(files);
			}
		});
	})
		.then(function(files) {
			return promiseForEach(files, function(file) {
				if (file.match(/^.+\.md$/)) {
					var filePath = path.join(outputPath, file);
					return new Promise(function(resolve, reject) {
						fs.unlink(filePath, function(err) {
							if (err) {
								err.message = 'Failed to unlink ' + JSON.stringify(filePath) + ' -- ' + err.message;
								reject(err);
							}
							else {
								resolve();
							}
						});
					});
				}
			})
		});
}

function filterTemplateData(templateData) {
	return templateData.filter(function(doclet) {
		return (includeProtected || doclet.access !== 'protected')
			&& (includePrivate || doclet.access !== 'private');
	});
}

function buildProjectREADME(prefix, templateData, options) {
	var additionalOptions = {
		helper: [
			path.join(__dirname, 'helpers.js'),
			path.join(__dirname, 'helpers-' + prefix.toLowerCase() + '.js')
		],
		partial: [
			path.join(__dirname, 'partials/*.hbs'),
			path.join(__dirname, 'partials-' + prefix.toLowerCase() + '/*.hbs')
		]
	};

	return new Promise(function(resolve, reject) {
		fs.readFile(path.join(__dirname, prefix + '.hbs'), { encoding: 'utf8' }, function(err, data) {
			if (err) {
				reject(err);
			}
			else {
				resolve(data);
			}
		});
	})
		.then(function(templateREADME) {
			// Create project README
			return dmd.async(templateData, Object.assign({}, options, additionalOptions, {
				data: templateData,
				template: templateREADME
			}))
		})
		.then(function(output) {
			return new Promise(function(resolve, reject) {
				fs.writeFile(outputPath, output, function(err) {
					if (err) {
						reject(err);
					}
					else {
						resolve();
					}
				});
			});
		});
}

function buildUnified(templateData, options) {
	return dmd.async(templateData, Object.assign({}, options, {
		'param-list-format': 'list',
		data: templateData
	}))
		.then(function(output) {
			return new Promise(function(resolve, reject) {
				fs.writeFile(outputPath, output, function(err) {
					if (err) {
						reject(err);
					}
					else {
						resolve();
					}
				});
			});
		});
}

function buildSplit(templateData, options) {
	var additionalOptions = {
		helper: path.join(__dirname, 'helpers.js'),
		partial: path.join(__dirname, 'partials/*.hbs')
	};

	// Create main index file
	return dmd.async(templateData, Object.assign({}, options, additionalOptions, {
		data: templateData,
		template: '# cwlogs-writable ' + (includeProtected ? 'Extended API' : 'API') + '\n\n{{>main-index}}'
	}))
		.then(function(output) {
			return new Promise(function(resolve, reject) {
				fs.writeFile(path.join(outputPath, 'README.md'), output, function(err) {
					if (err) {
						reject(err);
					}
					else {
						resolve();
					}
				});
			});
		})
		.then(function() {
			// Create individual files for classes, modules, etc
			return promiseForEach(templateData, function(doclet) {
				if (doclet.memberof) {
					return;
				}

				var template;
				var outputName;

				if (doclet.kind === 'class') {
					template = '# [cwlogs-writable ' + (includeProtected ? 'Extended API' : 'API') + '](README.md): Class:\n\n'
						+ '{{#class name="' + doclet.name + '"}}{{>docs}}{{/class}}';
					outputName = doclet.name;
				}
				else if (doclet.kind === 'module') {
					template = '# [cwlogs-writable ' + (includeProtected ? 'Extended API' : 'API') + '](README.md): Module:\n\n'
						+ '{{#module name="' + doclet.name + '"}}{{>docs}}{{/module}}';
					outputName = 'module_' + doclet.name.replace(/\//g, '_');
				}
				else if (doclet.kind === 'typedef') {
					template = '# [cwlogs-writable ' + (includeProtected ? 'Extended API' : 'API') + '](README.md): Typedef:\n\n'
						+ '{{#typedef name="' + doclet.name + '"}}{{>docs}}{{/typedef}}';
					outputName = doclet.name;
				}
				else {
					throw new Error('Unsupported orphan doclet kind "' + doclet.kind + '": ' + doclet.name);
				}

				return dmd.async(templateData, Object.assign({}, options, additionalOptions, {
					data: templateData,
					template: template
				}))
					.then(function(output) {
						return new Promise(function(resolve, reject) {
							fs.writeFile(path.join(outputPath, outputName + '.md'), output, function(err) {
								if (err) {
									reject(err);
								}
								else {
									resolve();
								}
							});
						});
					});
			});
		});
}

function getTemplateData(options) {
	options = options || {};
	return getJsdocData(options)
		.then(jsdocParse);
}

function getJsdocData(options) {
	return jsdocApi.explain(Object.assign({}, options));
}

function promiseForEach(arr, fn) {
	var i = 0;
	arr = arr.slice(0);

	function next() {
		if (i >= arr.length) {
			return Promise.resolve();
		}

		return new Promise(function(resolve) {
			resolve(fn(arr[i], i++));
		}).then(next);
	}

	return next();
}
