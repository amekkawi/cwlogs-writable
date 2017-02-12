var handlebars = require('handlebars');

if (!handlebars.helpers.inlineLinks) {
	throw new Error('inlineLinks helper not registered -- might not be the correct handlebars instance');
}

exports.linkPrefix = function() {
	return '';
};

exports.typedef = function(options) {
	options.hash.kind = 'typedef';
	var result = handlebars.helpers._identifier(options);
	return result ? options.fn(result) : 'ERROR, Cannot find typedef.';
};

exports.paramsOptions = function(options) {
	if (this.params) {
		var list = this.params.filter(function(param) {
			return param.name.indexOf('options.') === 0;
		}).map(function(param) {
			var name = param.name.substr('options.'.length);

			if (param.variable)
				name = '...' + name;

			//if (param.optional)
			//	name = '[' + name + ']';

			return {
				name: name,
				type: param.type,
				optional: param.optional,
				defaultvalue: param.defaultvalue,
				description: param.description
			}
		});
		return options.fn(list)
	}
};

exports.link = function(longname, options) {
	return options.fn(_link(longname, options));
};

exports.mdLink = function(longname, options) {
	var linked = handlebars.helpers._identifier(Object.assign({}, options, {
		longname: longname
	}));

	if (!linked) {
		return longname;
	}

	var link = _link(longname, options);
	return link.url ? '[' + longname + '](' + link.url + ')' : longname;
};

exports.inlineLinks = function(text, options) {
	if (text) {
		var links = handlebars.helpers.parseLink(text);
		links.forEach(function(link) {
			var linked = _link(link.url, options);
			if (link.caption === link.url) {
				//link.caption = linked.name;
			}
			if (linked.url) {
				link.url = linked.url;
			}
			text = text.replace(link.original, '[' + link.caption + '](' + link.url + ')');
		});
	}
	return text;
};

function _link(input, options) {
	if (typeof input !== 'string') {
		return null;
	}
	var linked, matches, namepath;
	var output = {};

	/*
	 test input for
	 1. A type expression containing a namepath, e.g. Array.<module:Something>
	 2. a namepath referencing an `id`
	 3. a namepath referencing a `longname`
	 */
	if ((matches = input.match(/.*?<(.*?)>/))) {
		namepath = matches[1];
	}
	else {
		namepath = input;
	}

	options.hash = { id: namepath };
	linked = handlebars.helpers._identifier(options);

	function getRootMember(linked) {
		if (!linked) {
			return null;
		}

		if (!linked.memberof) {
			return linked;
		}

		var parent = handlebars.helpers._identifier(Object.assign({}, options, {
			hash: {
				id: linked.memberof
			}
		}));

		if (!parent) {
			return null;
		}

		return getRootMember(parent);
	}

	if (!linked) {
		options.hash = { longname: namepath };
		linked = handlebars.helpers._identifier(options);
	}

	if (!linked) {
		return {
			name: input,
			url: null
		};
	}

	output.name = input.replace(namepath, linked.name);

	if (handlebars.helpers.isExternal.call(linked)) {
		if (linked.description) {
			output.url = '#' + handlebars.helpers.anchorName.call(linked, options);
		}
		else {
			if (linked.see && linked.see.length) {
				var firstLink = handlebars.helpers.parseLink(linked.see[0])[0];
				output.url = firstLink ? firstLink.url : linked.see[0];
			}
			else {
				output.url = null;
			}
		}
	}
	else {
		var rootMember = getRootMember(linked);

		output.url = '#' + handlebars.helpers.anchorName.call(linked, options);

		if (true) { // TODO: Do "unified" check
			output.url = handlebars.helpers.linkPrefix() + output.url;
		}
		else {
			if (!rootMember) {
				throw new Error('Failed to find root member for ' + linked.longname);
			}
			else if (rootMember.kind === 'class') {
				output.url = handlebars.helpers.linkPrefix() + rootMember.name + '.md' + output.url;
			}
			else if (rootMember.kind === 'module') {
				output.url = handlebars.helpers.linkPrefix() + 'module_' + rootMember.name.replace(/\//g, '_') + '.md' + output.url;
			}
			else if (rootMember.kind === 'typedef') {
				output.url = handlebars.helpers.linkPrefix() + rootMember.name + '.md' + output.url;
			}
			else {
				throw new Error('Unsupported root kind: ' + rootMember.kind + ' for ' + rootMember.longname);
			}
		}
	}

	return output;
}
