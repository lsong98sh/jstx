(function() {
	var special_attributes = {
		"input": new Set(["disabled", "readonly", "checked", "required"]),
		"textarea": new Set(["disabled", "readonly"]),
		"select": new Set(["disabled", "readonly", "multiple"]),
		"button": new Set(["disabled"]),
		"link": new Set(["disabled"]),
		"style": new Set(["disabled"]),
		"option": new Set(["selected"]),
		"img": new Set(["ismap"]),
		"td": new Set(["nowrap"]),
		"th": new Set(["nowrap"]),
		"dialog": new Set(["open"])
	};
	/* 
		解析文本 查找 {{}} 表达式，并按照表达式分解 
		返回：分段数组 
		abc{{abc/2}} 返回
		[{type: "text", value="abc"}, {type: "expr", value: {{abc / 2}}]
	*/
	function mustach(txt) {
		let result = [],
			len = txt.length,
			pos = 0,
			data = [],
			stage = 0,
			escape = false,
			qoute = false,
			pairs = [],
			brace = 0,
			ch, expr, fn;
		for (;;) {
			ch = txt.charAt(pos++);
			if (ch == "") {
				break;
			}
			if (stage == 1) {
				if (qoute) {
					if (escape) {
						escape = false;
					} else {
						if (ch == '\\') {
							escape = true;
						} else if (ch == "'" || ch == '"') {
							if (pairs[pairs.length - 1] == ch) {
								pairs.pop();
								qoute = false;
							}
						}
					}
				} else if (ch == "'" || ch == '"') {
					qoute = true;
					pairs.push(ch);
				} else if (ch == "}") {
					if (brace > 0) {
						brace--;
					} else {
						ch += txt.charAt(pos++);
						if (ch == "}}") {
							stage = 0;
							if (data.length > 0) {
								expr = data.join('');
								result.push({
									type: "expr",
									value: "{{" + expr + "}}"
								});
								data = [];
							}
							continue;
						}
					}
				} else if (ch == '{') {
					++brace;
				}
				data.push(ch);
			} else {
				if (ch == '{') {
					ch += txt.charAt(pos++);
					if (ch == "{{") {
						stage = 1;
						if (data.length > 0) {
							result.push({
								type: "text",
								value: data.join('')
							});
							data = [];
						}
						continue;
					}
				}
				data.push(ch);
			}
		}
		if (stage == 1) {
			throw "expression error:" + data.join('');
		}
		if (data.length > 0) {
			result.push({
				type: "text",
				value: data.join('')
			});
			data = [];
		}
		return result;
	}

	/* 返回指定长度的随机字符串 */
	function uuid(len) {
		let n = len ? len : 16,
			s = [],
			digits = "0123456789abcdefghijklmnopqrstuvwxyz";
		while (n--) {
			s.push(digits.charAt(Math.floor(Math.random() * digits.length)));
		}
		return s.join("");
	}

	/* 字符串替换 */
	function replace(s, ary, exp) {
		if (s == null || s.length == 0) return "";
		if (ary == null || Object.keys(ary).length == 0) return s;
		if (exp == undefined)
			exp = new RegExp(Object.keys(ary).map(e => e.replace(/\\/g, "\\\\")).join("|"), "g");
		return s.replace(exp, function(m) {
			return ary[m];
		});
	}

	/* 转换 html 的转义符 */
	function attr2code(s) {
		return replace(s, {
			"&lt;": "<",
			"&gt;": ">",
			"&nbsp;": " ",
			"&#39;": "'",
			"&quot;": '"',
			"&amp;": "&"
		})
	};

	/* 解析文本，并转换未返回字符串的表达式 */
	function attr2text(s) {
		if (s == null || s.length == 0) {
			return '""';
		}
		return mustach(s).map(e => {
			let t = attr2code(e.value);
			if (e.type == "text") {
				return "\"" + replace(t, {
					"\\": "\\\\",
					"\"": "\\\"",
					"\t": "\\t",
					"\r": "\\r",
					"\n": "\\n"
				}) + "\"";
			} else {
				let v = "_s_";
				t = t.substring(2, t.length - 2);
				return `function(){try{let ${v} = ${t}; return (${v}==undefined || ${v}==null)?'':${v};}catch(err){return ''}}()`;
			}
		}).join("+");
	}

	/* 代码格式化 */
	function xcode(){
		Object.defineProperty(this, "lines", {
			value: []
		});
	}
	Object.assign(xcode.prototype, {
		push: function(s, t){
			if(s != null && s!=undefined && s.length == 0){
				return this;
			}
			let x = "\t".repeat(t? t:0);
			if(s instanceof xcode){
				this.lines.push.apply(this.lines, s.lines.map(e => x + e));
			}else{
				try{
				s = s.replace(/(\s|;)+$/gm, "");
				if (!s.match(/\{$/gm)) {
					s += ";";
				}
				this.lines.push(x + s);
				}catch(e){
					throw e;
				}
			}
			return this;
		},
		toString: function(){
			return this.lines.join("\r\n");
		}
	});
	/* 指令定义 */
	let directives = [{
			name: "script",
			compile: function(jst, node, opt, action) {
				if (action.value == null) {
					return "";
				}
				action.remove = true;
				action.recursive = false;
				action.skip = true;
				return (new xcode()).push(node.innerText, action.tabs);
			}
		},
		{
			name: "skip",
			compile: function(jst, node, opt, action) {
				if (action.value != null) {
					action.recursive = false;
					action.skip = true;
				}
				return "";
			}
		},
		{
			name: "begin",
			compile: function(jst, node, opt, action) {
				return (new xcode()).push(attr2code(action.value), action.tabs);
			},
			cleanup: function(jst, node, opt, action) {
				return (new xcode()).push(attr2code(action.attrs[opt.prefix + "end"]), action.tabs);
			}
		},
		{
			name: "if",
			compile: function(jst, node, opt, action) {
				let code = new xcode();
				if (action.value != null) {
					action.nest = true;
					code.push(`if(${attr2code(action.value)}){`, action.tabs ++);
					code.push(`let $ctl=$ctx.ensure(${action.seqno});`, action.tabs);
				}
				return code;
			},
			cleanup: function(jst, node, opt, action) {
				let code = new xcode();
				if (action.value != null) {
					-- action.tabs;
					code.push(`}else{`, action.tabs);
					code.push(`$ctx.comment(${action.seqno});`,action.tabs + 1);
					code.push(`}`, action.tabs);
				}
				return code;
			}
		},
		{
			name: "each",
			compile: function(jst, node, opt, action) {
				let code = new xcode();
				if (action.value != null) {
					let pos = action.value.indexOf(":");
					if(pos > 0){
						let name = action.value.substring(0, pos).trim();
						let item = action.value.substring(pos+1).trim();
						action.nest = true;
						code.push(`$ctx.begin(${action.seqno});`, action.tabs);
						code.push(`jst.fx.each(${item}).forEach(function(${name},${name}$index,${name}$arr){`, action.tabs ++);
						code.push(`${name}$first = ${name}$index == 0;`, action.tabs);
						code.push(`${name}$last = ${name}$index == ${name}$arr.length - 1;`, action.tabs);
						code.push(`${name}$even = ${name}$index % 2 == 0;`, action.tabs);
						code.push(`${name}$odd = !${name}$even;`, action.tabs);
					}
				}
				return code;
			},
			cleanup: function(jst, node, opt, action) {
				let code = new xcode();
				if (action.value != null) {
					code.push(`});`, -- action.tabs);
					code.push(`$ctx.end(${action.seqno});`, action.tabs);
				}
				return code;
			}
		},
		{
			name: "for",
			compile: function(jst, node, opt, action) {
				let code = new xcode();
				if (action.value != null) {
					action.nest = true;
					code.push(`$ctx.begin(${action.seqno});`, action.tabs);
					code.push(`for(${attr2code(action.value)}){`, action.tabs ++);
				}
				return code;
			},
			cleanup: function(jst, node, opt, action) {
				let code = new xcode();
				if (action.value != null) {
					code.push(`}`, -- action.tabs);
					code.push(`$ctx.end(${action.seqno});`, action.tabs);
				}
				return code;
			}
		},
		{
			name: "item-prepare",
			compile: function(jst, node, opt, action) {
				return (new xcode()).push(attr2code(action.value), action.tabs);
			}
		},
		{
			name: "filter",
			compile: function(jst, node, opt, action) {
				let code = new xcode();
				if (action.attrs[opt.prefix + "for"] || action.attrs[opt.prefix + "each"]) {
					if (action.value != null) {
						code.push(`if(${attr2code(action.value)}){`, action.tabs ++);
					}
					code.push(`let $ctl=$ctx.increase(${action.seqno});`, action.tabs);
				}
				return code;
			},
			cleanup: function(jst, node, opt, action) {
				let code = new xcode();
				if ((action.attrs[opt.prefix + "for"] || action.attrs[opt.prefix + "each"]) && action.value != null) {
					if (action.value != null) {
						code.push(`}`, -- action.tabs);
					}
				}
				return code;
			}
		},
		{
			name: "item-begin",
			compile: function(jst, node, opt, action) {
				return (new xcode()).push(attr2code(action.value), action.tabs);
			},
			cleanup: function(jst, node, opt, action) {
				return (new xcode).push(attr2code(action.attrs[opt.prefix + "item-end"]), action.tabs);
			}
		},
		{
			name: "html",
			compile: function(jst, node, opt, action) {
				return (new xcode()).push((action.value == null) ? "" : `jst.fx.html($ctl, ${attr2text(action.value)})`, action.tabs);
			}
		},
		{
			name: "text",
			compile: function(jst, node, opt, action) {
				return (new xcode()).push((action.value == null) ? "" : `jst.fx.text($ctl, ${attr2text(action.value)})`, action.tabs);
			}
		},
		{
			name: "checked",
			compile: function(jst, node, opt, action) {
				return new xcode();
			},
			cleanup: function(jst, node, opt, action) {
				let code = new xcode();
				if (action.value != null && node.tagName == "INPUT" && (node.type.toLowerCase() =="radio" || node.type.toLowerCase() == "checkbox")) {
					code.push(`$ctl.checked = ${action.value};`, action.tabs);
				}
				return code;
			}			
		},
		{
			name: "selected",
			compile: function(jst, node, opt, action) {
				return new xcode();
			},
			cleanup: function(jst, node, opt, action) {
				let code = new xcode();
				if (action.value != null && node.tagName == "SELECT") {
					code.push(`jst.fx.selected($ctl, ${action.value})`, action.tabs);
				}
				return code;
			}			
		},
		{
			name: "data-*",
			compile: function(jst, node, opt, action) {
				let code = new xcode(),
					keys = Object.keys(action.xattrs),
					i = 0,
					n = keys.length,
					key;
				for (; i < n; ++i) {
					key = keys[i];
					if (key.indexOf(opt.prefix + "data-") == 0) {
						code.push(`jst.fn.data($ctl, "${key.substring(opt.prefix.length + 5)}", ${attr2code(action.attrs[key])});`, action.tabs);
						node.removeAttribute(key);
						delete action.xattrs[key];
					}
				}
				return code;
			}
		},
		{
			name: "on*",
			compile: function(jst, node, opt, action) {
				let code = new xcode(),
					keys = Object.keys(action.xattrs),
					i = 0,
					n = keys.length,
					key;
				for (; i < n; ++i) {
					key = keys[i];
					if (key.indexOf(opt.prefix + "on") == 0) {
						//if (!action.xattrs[key].match(/^[A-Za-z$_][A-Za-z0-9$_]*\(.*\)$/gm)) {
						//	console.log("expression error for jst-on*.");
						//} else {
							let expr = action.xattrs[key],
								fprop = key.substring(opt.prefix.length),
								fname = expr.slice(0, expr.indexOf('(')),
								fdata = "[" + expr.slice(expr.indexOf('(') + 1, -1) + "]";

							//code.push(`jst.fn.data($ctl, "${fprop}", ${fdata});`, action.tabs);
							//code.push(
							//	`$ctl.${fprop}=(function(){return function(){with(Object.assign({}, $data, {$data: $data, $jst: $jst})){${fname}.apply(this, jst.fn.data(this, "${fprop}"))}}})();`
							//, action.tabs);
							code.push(`$ctl.${fprop} = (function($jst){return function(){ with($jst.methods){${expr}}}})($jst)`);
							//code.push(`$ctl.${fprop} = ${expr}`);
						//}
						node.removeAttribute(key);
						delete action.xattrs[key];
					}
				}
				return code;
			}
		},
		{
			name: "*",
			compile: function(jst, node, opt, action) {
				let code = new xcode(),
					keys = Object.keys(action.xattrs),
					i = 0,
					n = keys.length,
					key, prop;
				for (; i < n; ++i) {
					prop = key = keys[i];
					if (key.indexOf(opt.prefix) == 0) {
						prop = key.substring(opt.prefix.length);
					}
					code.push(`jst.fn.attr($ctl, "${prop}", ${attr2text(action.attrs[key])});`, action.tabs);
					node.removeAttribute(key);
					delete action.xattrs[key];
				}
				return code;
			}
		},
		{
			name: "include-data",
			compile: function(jst, node, opt, action) {
				let code = new xcode();
				if (action.value != null) {
					code.push(`jst.fx.include.set($jst, $ctl, 'data', ${attr2code(action.value)});`, action.tabs);
				}
				return code;
			}
		},
		{
			name: "include-option",
			compile: function(jst, node, opt, action) {
				let code = new xcode();
				if (action.value != null) {
					code.push(`jst.fx.include.set($jst, $ctl, 'option', ${attr2code(action.value)});`, action.tabs);
				}
				return code;
			}
		},
		{
			name: "include-refresh",
			compile: function(jst, node, opt, action) {
				let code = new xcode();
				if (action.value != null) {
					if(action.value == 'true' || action.value == 'false'){
						code.push(`jst.fx.include.set($jst, $ctl, 'refresh', ${action.value});`, action.tabs);
					}else{
						code.push(`jst.fx.include.set($jst, $ctl, 'refresh', ${attr2code(action.value)});`, action.tabs);
					}
				}
				return code;
			}
		},
		{
			name: "include",
			compile: function(jst, node, opt, action) {
				let code = new xcode();
				if (action.value != null) {
					code.push(`jst.fx.include.set($jst, $ctl, 'name', ${attr2text(action.value)});`, action.tabs);
				}
				return code;
			},
			cleanup: function(jst, node, opt, action) {
				let code = new xcode();
				if (action.value != null) {
					code.push(`jst.fx.include.render($jst, $ctl)`, action.tabs);
				}
				return code;
			}
		},
		{
			name: "recursive",
			compile: function(jst, node, opt, action) {
				let code = new xcode();
				if (action.value != null) {
					action.nest = true;
					code.push(`if(${attr2code(action.value)}){`, action.tabs ++);
				}
				return code;
			},
			cleanup: function(jst, node, opt, action) {
				let code = new xcode();
				if (action.value != null) {
					code.push(`}`, -- action.tabs);
				}
				return code;
			}
		},
		{
			name: "item-end"
		},
		{
			name: "end"
		}
	];

	/* 编译模板 */
	function compile(jst, target, opt, psn) {
		if (!target.hasChildNodes()) {
			return ;
		}
		let childs = target.childNodes,
			code = new xcode(),
			node, i, n, action, directive, items, e, el;
		for (i = 0; i < childs.length; ++i) {
			node = childs[i];
			switch (node.nodeType) {
				case 8: //comment
					target.removeChild(node);
					--i;
					break;
				case 3: //text
					if (!opt.skipText) {
						items = mustach(node.nodeValue);
						if (items.length > 1 || items[0].type != 'text') {
							for (n = 0; n < items.length; ++n) {
								e = items[n];
								if (e.type == 'text') {
									el = document.createTextNode(e.value);
								} else {
									el = document.createElement(opt.textTag);
									el.setAttribute(opt.prefix + "text", e.value);
								}
								target.insertBefore(el, node);
							}
							target.removeChild(node);
							i += (items[0].type != 'text') ? -1 : 0;
						}
					}
					break;
				case 1: //element
					action = {
						match: false,
						skip: false,
						remove: false,
						recursive: true,
						nest: false,
						attrs: {},
						xattrs: {},
						tabs: 0
					};
					Array.prototype.slice.call(node.attributes).forEach(function(e) {
						if (e.specified) {
							action.attrs[e.nodeName] = e.nodeValue;
							if (e.nodeName.indexOf(opt.prefix) == 0) {
								action.match = true;
								if (directives.filter(d => (opt.prefix + d.name) == e.nodeName)
									.length == 0) {
									action.xattrs[e.nodeName] = e.nodeValue;
								}
							} else if (e.nodeValue.indexOf("{{") >= 0 && e.nodeValue.indexOf("}}") > 0) {
								action.xattrs[e.nodeName] = e.nodeValue;
								action.match = true;
							}
						}
					});

					if (action.match) {
						node.setAttribute(opt.prefix + "id-" + opt.id, ++opt.seqno);
						node.setAttribute(opt.prefix + "pid-" + opt.id, (psn==-1)? "x" : psn);
						action.seqno = opt.seqno;
						code.push(`{let $ctl=$ctx.get(${opt.seqno})`, action.tabs);
						for (n = 0; n < directives.length; ++n) {
							directive = directives[n];
							if (action.skip || action.remove) {
								node.removeAttribute(opt.prefix + directive.name);
							} else {
								action.value = node.getAttribute(opt.prefix + directive.name);
								if (directive.compile) {
									code.push(directive.compile.call(directive, jst, node, opt, action));
								}
							}
						}
						if (action.remove) {
							code.lines.splice(code.lines.lastIndexOf(`{let $ctl=$ctx.get(${opt.seqno});`), 1);
							--opt.seqno;
						}
					}
					if (!action.remove && action.recursive && node.hasChildNodes()) {
						if (action.nest) {
							code.push(`$ctx.push(${opt.seqno});`, action.tabs);
						}
						code.push(compile(jst, node, opt, (action.nest)? opt.seqno : psn), action.tabs);
						if (action.nest) {
							code.push(`$ctx.pop();`, action.tabs);
						}
					}
					if (action.match) {
						if (!action.remove) {
							for (--n; n >= 0; --n) {
								directive = directives[n];
								action.value = node.getAttribute(opt.prefix + directive.name);
								if (directive.cleanup) {
									code.push(directive.cleanup.call(directive, jst, node, opt, action));
								}
								node.removeAttribute(opt.prefix + directive.name);
							}
							opt.dnt[action.seqno] = node;
							code.push("}")
						} else {
							target.removeChild(node);
							--i;
						}
					}
					break;
			}
		}
		return code;
	}

	/* 渲染上下文处理 */
	function JstRenderContext(el, opt, dnt) {
		this.opt = opt;
		this.dnt = dnt;
		this.ids = opt.prefix + "id-" + opt.id,
		this.pids = opt.prefix + "pid-" + opt.id,
		this.dms = {
			children: [],
			pos: -1,
			id: 'x'
		}
		this.build(el, this.dms);
		this.top = this.dms;
		this.stk = [];
	}
	Object.assign(JstRenderContext.prototype, {
		init: function(){
			this.dms = this.top;
			this.stk = [];
			this.dms.pos = -1;
			this.dms.index = 0;
		},
		build: function(el, dms) {
			let stk = [], pids = this.pids, ids = this.ids;
			function recursive(el, dms){
				let c = el.firstElementChild, psn, o;
				while(c){
					psn = c.getAttribute(pids);
					if(psn != null) {
						if(psn != dms.id){
							stk.push(dms);
							dms = dms.children[dms.children.length-1].nodes[0];
						}
						o = {
							nodes: [{
								dom: c, 
								children: [],
								id: c.getAttribute(ids),
								pos: 0
							}],
							index: 0
						};
						dms.children.push(o);
					}
					if(c.hasChildNodes()){
						recursive(c, dms);
						if(psn != null && psn != dms.id){
							dms = stk.pop(dms);
						}
					}
					c.removeAttribute(pids);
					c.removeAttribute(ids);
					c = c.nextElementSibling;
				}
			}
			recursive(el, dms);
			el.removeAttribute(pids);
			el.removeAttribute(ids);
		},
		push: function(seqno) {
			this.stk.push(this.dms);
			let cur = this.dms.children[this.dms.pos];
			this.dms = cur.nodes[cur.index];
			this.dms.pos = -1;
			this.dms.index = 0;
		},
		pop: function() {
			this.dms = this.stk.pop();
		},
		get: function(seqno) {
			let m = this.dms.children[++ this.dms.pos];
			return m.nodes[m.index].dom;
		},
		comment: function(seqno) {
			let m = this.dms.children[this.dms.pos],
				i = m.index,
				d = m.nodes[i].dom;
			if (d.nodeType != 8) {
				let n = document.createComment(this.opt.id);
				d.parentNode.insertBefore(n, d);
				d.parentNode.removeChild(d);
				m.nodes[i].dom = n;
				m.nodes[i].children = null;
			}
		},
		ensure: function(seqno) {
			let m = this.dms.children[this.dms.pos],
				i = m.index, d, n, o;
			if(!m.nodes[i]){
				m.nodes[i] = {};
			} 
			o = m.nodes[i];
			d = n = o.dom;
			if (d == undefined || d.nodeType == 8) {
				n = this.dnt[seqno].cloneNode(true);
				if (d != undefined) {
					d.parentNode.insertBefore(n, d);
					d.parentNode.removeChild(d);
				} else {
					d = m.nodes[i-1].dom;
					if (d.nextSibling) {
						d.parentNode.insertBefore(n, d.nextSibling);
					} else {
						d.parentNode.appendChild(n);
					}
				}
				o.dom = n;
				o.children = null;
			}
			if (o.children == null) {
				o.children = [];
				o.pos = -1;
				o.id = seqno;
				this.build(n, o);
			}
			return n;
		},
		begin: function(seqno) {
			this.dms.children[this.dms.pos].index = -1;
		},
		increase: function(seqno) {
			this.dms.children[this.dms.pos].index++;
			return this.ensure(seqno);
		},
		end: function(seqno) {
			let m = this.dms.children[this.dms.pos],
				len = m.nodes.length;
			m.index++;
			if (m.index == 0) {
				this.comment(seqno);
				m.index = 1;
			}
			for (let i = len - 1; i >= m.index; --i) {
				let d = m.nodes[i].dom;
				d.parentNode.removeChild(d);
			}
			m.nodes.splice(m.index, len - m.index);
			m.index = 0;
		}
	});

	var templates = {};
	/* jst 主类 */
	function jst(template, target, option, parent) {
		var awaits = [], self = this;
		this.addAwait = function(promise) {
			awaits.push(promise);
		}
		Object.keys(jst.prepare).forEach(function(selector, index, array){
			let objs = template.querySelectorAll(selector);
			for(let i=0; i < objs.length; ++ i){
				let r = jst.prepare[selector](self, objs[i], template);
				if(r){
					awaits.push(r);
				}
			}
		});
		
		this.ctx = null;
		this.ready = Promise.all(awaits).then(awaits = []);

		let prop = Object.defineProperty;
		prop(this, "parent", {
			value: parent
		});
		prop(this, "target", {
			value: target ? target : template
		});
		if(!template.id){
			template.setAttribute("id", uuid(8));
		}

		prop(this, "children", {
			value: []
		});
		
		this.methods = {};

		this.ready.then(()=>{
			if(!templates[template.id]){
				var opt = Object.assign({}, jst.option, option, {
						id: uuid(8),
						seqno: -1,
						dnt: []
				}), 
				tmpl = template.cloneNode(true),
				code = (new xcode()).push(compile(self, tmpl, opt, -1),2).toString(),
				dnt = opt.dnt;
				delete opt.seqno;
				delete opt.dnt;
				
				templates[template.id] = Object.freeze({
					dom: tmpl,
					code: code,
					html: tmpl.innerHTML,
					dnt: dnt,
					option: opt,
					executor: new Function("$jst", "$ctx", "$data", "$target", "\tvar $ctl;\r\n\twith($data){\r\n" + code + "\r\n\t}")
				});
			}
			prop(self, "template", {
				value: templates[template.id]
			});
		});
		//console.log(this.template.code);
	}
	jst.prototype.render = function(data, force) {
		var self = this;
		return this.ready.then(function(){
			if (force || !self.ctx) {
				self.target.innerHTML = self.template.html;
				self.ctx = new JstRenderContext(self.target, self.template.option, self.template.dnt);
				//console.log(this.ctx);
			}
			self.ctx.init();
			if(typeof(data) == 'object'){
				self.data = data;
			}
			if(typeof(self.data) != 'object') {
				self.data = {};
			}
			self.template.executor(self, self.ctx, self.data, self.target);
		});
	};
	jst.prototype.refresh = function(){
		return this.render(this.data);
	};
	jst.prototype.trigger = function(name, data){
		this.target.dispatchEvent(new CustomEvent("jst-event-" + name, {
			detail: data,
		}));
	};
	jst.prototype.bind = function(name, callback){
		var obj = this;
		this.target.addEventListener("jst-event-" + name, function(){
			callback.apply(obj, arguments);
		});
	};
	
	jst.option = {
		skipText: false,
		prefix: 'jst-',
		textTag: 'text',
	};
	
	jst.fn = {
		data: function(node, name, value, def) {
			if (node.jstdata == undefined) {
				node.jstdata = {};
			}
			if (arguments.length == 2) {
				return node.jstdata[name];
			} else if (arguments.length == 3) {
				node.jstdata[name] = value;
			} else if(def){
				if(node.jstdata[name] == undefined){
					node.jstdata[name] = value;
				}
				return node.jstdata[name];
			}
		},
		attr: function(node, name, value) {
			if (arguments.length == 2) {
				return node.getAttribute(name);
			}
			var tagName = node.nodeName.toLocaleLowerCase();
			name = name.toLocaleLowerCase();
			if (special_attributes[tagName] && special_attributes[tagName].has(name)) {
				if (value === false || value === "false" || value === 0) {
					if (node.getAttribute(name) != null) {
						node.removeAttribute(name);
						if (name == "checked" && tagName == "input") {
							node.checked = false;
						}
					}
				} else {
					if (node.getAttribute(name) == null) {
						node.setAttribute(name, value);
						if (name == "checked" && tagName == "input") {
							node.checked = true;
						}
					}
				}
			} else {
				if (node.getAttribute(name) != value) {
					node.setAttribute(name, value);
					if (name.toLocaleLowerCase() == "class") {
						node.className = value;
					}
					if (name.toLocaleLowerCase() == "style") {
						node.style.cssText = value;
					}
					if (name.toLocaleLowerCase() == "value" && tagName == "input") {
						node.value = value;
					}
				}
			}
		}
	}

	/* 指令的执行代码 */
	jst.fx = {
		text: function(ctl, txt){
			let s = jst.fn.data(ctl, "$fx_text"); 
			if(s == null || s != txt){
				ctl.innerText = txt;
				jst.fn.data(ctl, "$fx_text", txt);
			}
		},
		html: function(ctl, txt){
			let s = jst.fn.data(ctl, "$fx_html"); 
			if(s == null || s != txt){
				ctl.innerHTML = txt;
				jst.fn.data(ctl, "$fx_html", txt);
			}
		},
		selected: function(ctl, value){
			if(Array.isArray(value)){
				if(ctl.multiple){
					var values = value.map(v => "" + v);
					for (var i = 0; i < ctl.options.length; i++){
						if (values.indexOf(ctl.options[i].value)) {
							ctl.options[i].selected = true;
						}
					}
					return;
				}
				if(value.length > 0){
					value = value[0];
				} else {
					value = null;
				}
			}
			for (var i = 0; i < ctl.options.length; i++){
				if (ctl.options[i].value == value) {
					ctl.options[i].selected = true;
					break;
				}
			}
		},
		// for: {
		// 	begin: function(){},
		// 	increase: function(){},
		// 	end: function(){}
		// },
		// each: {
		// 	begin: function(){},
		// 	increase: function(){},
		// 	end: function(){}
		// },
		each: function(item, name, fn){
			var ary = item;
			if(typeof(item) == "string"){
				ary = item.split("");
			}
			if(!Array.isArray(ary) && ary.length && typeof(ary.length) === 'number' && ary.length > 0 && ( ary.length - 1 ) in obj){
				ary = [];
				for(let i=0; i < item.length; ++ i){
					ary.push(item[i]);
				}
			}
			return ary;
		},
		include: {
			data: function(parent, ctl){ return {
				refresh: false,
				option: {},
				data: {}
			}},
			set: function(parent, ctl, name, value){
				let t = jst.fn.data(ctl, '$include', jst.fx.include.data(parent, ctl), true);
				t[name] = value;
			},
			render: function(parent, ctl){
				let t = jst.fn.data(ctl, '$include', jst.fx.include.data(parent, jst), true);
				if(t.pre != t.name ){
					jst.locator(t.name).then(function(dom){
						if(dom.id == t.name){
							t.jst = new jst(dom, ctl, t.option, parent);
							t.jst.render(t.data, t.refresh);
							parent.children.push(t.jst);
							t.pre = t.name;
						}
					});
				} else {
					t.jst.render(t.data, t.refresh);
				}
			}
		}
	}
	
	jst.prepare = {
		'script[type="script/jst"]': function(jst, elm, template){
			var node = document.createElement("div");
			node.innerHTML = elm.innerHTML;
			let src = elm.getAttribute("src");
			if(src != null){
				node.setAttribute("src", src);
			}
			node.setAttribute("jst-script", "jst-script");
			elm.parentNode.insertBefore(node, elm);
			elm.parentNode.removeChild(elm);
		},
		
		"[jst-script]": function(jst, elm, template){
			let src = elm.getAttribute("src"), base = template.getAttribute("base-url"), url;
			if(src != null){
				if(src.charAt(0) == '/' || src.startsWith("http://") || src.startsWith("https://")){
					url = src;
				}else{
					url = (base==null)? "": base + src;
				}
				return fetch(url, {credentials: 'include'}).then(response => response.text()).then(t => elm.innerHTML = t);
			}
		}
	};
	
	jst.locator = function(name){
		var dom = document.createElement("div");
		dom.innerText=`template name:${name} not found`;
		dom.id = name;
		
		var url = jst.locator.map[name];
		if(url){
			let base = "";
			if(url.lastIndexOf('/') >= 0){
				base = url.substring(0, 1 + url.lastIndexOf('/'));
			}
			function normalizeUrl(src){
				if(src.charAt(0) == '/' || src.startsWith("http://") || src.startsWith("https://")){
					return src;
				}
				return base + src;
			}
			return fetch(url, {credentials: 'include'}).then(response => response.text()).then(t => {
				let d = document.createElement("div");
				d.innerHTML = t;
				let n = d.firstElementChild, m;
				while(n){
					m = n.nextElementSibling;
					if(n.id == name){
						dom = n;
					dom.setAttribute("base-url", base);
					}else if(n.tagName == 'LINK'){
						n.setAttribute("href", normalizeUrl(n.getAttribute("href")));
						document.head.appendChild(n);
					}else if(n.tagName == 'STYLE'){
						document.head.appendChild(n);
					}else if(n.tagName == 'SCRIPT'){
						n.setAttribute("src", normalizeUrl(n.getAttribute("src")));
						document.head.appendChild(n);
					}
					n = m;
				}
				return dom;
			}).catch(() => dom);
		}else{
			return new Promise(function(resolve, reject){
				var elm = document.getElementById(name);
				resolve(elm == null? dom : elm);
			});
		}
	};
	jst.locator.map = {};
	
	jst.event = {
		bind: function(dom, name, selector, callback){
			dom.addEventListener(name, function(event){
				let doms = dom.querySelectorAll(selector);
				if(doms.length){
					let e = window.event || event;
					let path = event.path || (event.composedPath && event.composedPath());
					for(let i = 0; i < path.length; ++ i){
						for(let n = 0; n < doms.length; ++ n){
							if(doms[n] == path[i]){
								callback.apply(doms[n], arguments);
								return;
							}
						}
					}
				}
			})
		}
	}
	
	jst.directives = directives;
	jst.xcode = xcode;
	window.jst = jst;
})();
