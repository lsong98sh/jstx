(function() {
	let special_attributes = {
		"*": new Set(["draggable"]),
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
	let uuids = "0123456789abcdefghijklmnopqrstuvwxyz";
	function uuid(len) {
		let arr = "";
		for(let i =0; i < len; ++ i) {
			arr += uuids.charAt(Math.floor(Math.random()*36)); 
		} 
		return arr 
	}

	/* attribute 中的文本转代码 */
	function attr2code(s) {
		return (s == null)? "" : s;
	};
	
	/* 纯文本转换字符串表达式。比如： ABC  转换为 "ABC" */
	function text2code(s) {
		return (s == null || s.length == 0)? '""' : '"' + s.replace(/[\t\r\n'"\\]/g, function(c){
			switch(c){
				case "\\": return "\\\\";
				case "\"": return "\\\"";
				case "\t": return "\\t";
				case "\'": return "\\\'";
				case "\r": return "\\r";
				case "\n": return "\\n"
			}
		}) + '"';
	}

	/* 解析带{{}}的文本，并转换为返回字符串的表达式 */
	function attr2text(s) {
		if (s == null || s.length == 0) {
			return '""';
		}
		return mustach(s).map(e => {
			let t = attr2code(e.value);
			if (e.type == "text") {
				return text2code(t);
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
				if (!s.match(/\{\s*$/gm)) {
					s += ";";
				}
				this.lines.push(x + s);
			}
			return this;
		},
		toString: function(){
			return this.lines.join("\r\n");
		}
	});
	/* 指令定义 */
	let directives = [
		{
			name: "script",
			compile: function(jst, node, opt, action, code) {
				if (action.value == null) {
					return "";
				}
				action.remove = true;
				action.recursive = false;
				action.skip = true;
				return code.push(node.innerText, action.tabs);
			}
		},
		{
			name: "skip",
			compile: function(jst, node, opt, action, code) {
				if (action.value != null) {
					action.recursive = false;
					action.skip = true;
				}
				return code;
			}
		},
		{
			name: "begin",
			compile: function(jst, node, opt, action, code) {
				return code.push(attr2code(action.value), action.tabs);
			},
			cleanup: function(jst, node, opt, action, code) {
				return code.push(attr2code(action.attrs[opt.prefix + "end"]), action.tabs);
			}
		},
		{
			name: "if",
			compile: function(jst, node, opt, action, code) {
				if (action.value != null) {
					action.nest = true;
					code.push(`if(${attr2code(action.value)}){`, action.tabs ++);
					code.push(`let $ctl=$ctx.ensure(${action.seqno});`, action.tabs);
				}
				return code;
			},
			cleanup: function(jst, node, opt, action, code) {
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
			compile: function(jst, node, opt, action, code) {
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
			cleanup: function(jst, node, opt, action, code) {
				if (action.value != null) {
					code.push(`});`, -- action.tabs);
					code.push(`$ctx.end(${action.seqno});`, action.tabs);
				}
				return code;
			}
		},
		{
			name: "for",
			compile: function(jst, node, opt, action, code) {
				if (action.value != null) {
					action.nest = true;
					code.push(`$ctx.begin(${action.seqno});`, action.tabs);
					code.push(`for(${attr2code(action.value)}){`, action.tabs ++);
				}
				return code;
			},
			cleanup: function(jst, node, opt, action, code) {
				if (action.value != null) {
					code.push(`}`, -- action.tabs);
					code.push(`$ctx.end(${action.seqno});`, action.tabs);
				}
				return code;
			}
		},
		{
			name: "item-prepare",
			compile: function(jst, node, opt, action, code) {
				return code.push(attr2code(action.value), action.tabs);
			}
		},
		{
			name: "filter",
			compile: function(jst, node, opt, action, code) {
				if (action.attrs[opt.prefix + "for"] || action.attrs[opt.prefix + "each"]) {
					if (action.value != null) {
						code.push(`if(${attr2code(action.value)}){`, action.tabs ++);
					}
					code.push(`let $ctl=$ctx.increase(${action.seqno});`, action.tabs);
				}
				return code;
			},
			cleanup: function(jst, node, opt, action, code) {
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
			compile: function(jst, node, opt, action, code) {
				return code.push(attr2code(action.value), action.tabs);
			},
			cleanup: function(jst, node, opt, action, code) {
				return code.push(attr2code(action.attrs[opt.prefix + "item-end"]), action.tabs);
			}
		},
		{
			name: "html",
			compile: function(jst, node, opt, action, code) {
				return code.push((action.value == null) ? "" : `jst.fx.html($ctl, ${attr2text(action.value)})`, action.tabs);
			}
		},
		{
			name: "text",
			compile: function(jst, node, opt, action, code) {
				return code.push((action.value == null) ? "" : `jst.fx.text($ctl, ${attr2text(action.value)})`, action.tabs);
			}
		},
		{
			name: "checked",
			compile: function(jst, node, opt, action, code) {
				return code;
			},
			cleanup: function(jst, node, opt, action, code) {
				if (action.value != null && node.tagName == "INPUT" && (node.type.toLowerCase() =="radio" || node.type.toLowerCase() == "checkbox")) {
					code.push(`$ctl.checked = ${action.value};`, action.tabs);
				}
				return code;
			}			
		},
		{
			name: "selected",
			compile: function(jst, node, opt, action, code) {
				return code;
			},
			cleanup: function(jst, node, opt, action, code) {
				if (action.value != null && node.tagName == "SELECT") {
					code.push(`jst.fx.selected($ctl, ${action.value})`, action.tabs);
				}
				return code;
			}			
		},
		{
			name: "bind-converter",
			compile: function(jst, node, opt, action, code) {
				if (action.value != null) {
					code.push(`jst.fx.data($ctl, '$jst-bind-converter', ${action.value})`, action.tabs);
				}
				return code;
			}
		},
		{
			name: "bind",
			compile: function(jst, node, opt, action, code) {
				return code;
			},
			cleanup: function(jst, node, opt, action, code) {
				if (action.value != null) {
					code.push(`jst.fx.data($ctl, '$jst-bind-get', function(){return ${action.value}})`, action.tabs);
					code.push(`jst.fx.data($ctl, '$jst-bind-set', function(v){${action.value}=v})`, action.tabs);
					code.push(`jst.fx.data($ctl, '$jst-bind-jst', $jst)`, action.tabs);
					code.push(`jst.fx.bind($jst, $ctl)`, action.tabs);
				}
				return code;
			}		
		},
		{
			name: "data-*",
			compile: function(jst, node, opt, action, code) {
				let keys = Object.keys(action.xattrs),
					i = 0,
					n = keys.length,
					key;
				for (; i < n; ++i) {
					key = keys[i];
					if (key.indexOf(opt.prefix + "data-") == 0) {
						code.push(`jst.fx.data($ctl, "${key.substring(opt.prefix.length + 5)}", ${attr2code(action.attrs[key])});`, action.tabs);
						node.removeAttribute(key);
						delete action.xattrs[key];
					}
				}
				return code;
			}
		},
		{
			name: "on*",
			compile: function(jst, node, opt, action, code) {
				let keys = Object.keys(action.xattrs),
					i = 0,
					n = keys.length,
					key;
				for (; i < n; ++i) {
					key = keys[i];
					if (key.indexOf(opt.prefix + "on") == 0) {
						let expr = action.xattrs[key],
							fprop = key.substring(opt.prefix.length);
						code.push(`$ctl.${fprop} = function(){ ${expr} }`);
						node.removeAttribute(key);
						delete action.xattrs[key];
					}
				}
				return code;
			}
		},
		{
			name: "*",
			compile: function(jst, node, opt, action, code) {
				let keys = Object.keys(action.xattrs),
					i = 0,
					n = keys.length,
					key, prop;
				for (; i < n; ++i) {
					prop = key = keys[i];
					if (key.indexOf(opt.prefix) == 0) {
						prop = key.substring(opt.prefix.length);
					}
					code.push(`jst.fx.attr($ctl, "${prop}", ${attr2text(action.attrs[key])});`, action.tabs);
					node.removeAttribute(key);
					delete action.xattrs[key];
				}
				return code;
			}
		},
		{
			name: "include-data",
			compile: function(jst, node, opt, action, code) {
				if (action.value != null) {
					code.push(`jst.fx.include.set($jst, $ctl, 'data', ${attr2code(action.value)});`, action.tabs);
				}
				return code;
			}
		},
		{
			name: "include-option",
			compile: function(jst, node, opt, action, code) {
				if (action.value != null) {
					code.push(`jst.fx.include.set($jst, $ctl, 'option', ${attr2code(action.value)});`, action.tabs);
				}
				return code;
			}
		},
		{
			name: "include-refresh",
			compile: function(jst, node, opt, action, code) {
				if (action.value != null) {
					code.push(`jst.fx.include.set($jst, $ctl, 'refresh', ${attr2code(action.value)});`, action.tabs);
				}
				return code;
			}
		},
		{
			name: "include",
			compile: function(jst, node, opt, action, code) {
				if (action.value != null) {
					code.push(`jst.fx.include.set($jst, $ctl, 'name', ${attr2text(action.value)});`, action.tabs);
					let cn = node.children;
					for(let i = 0; i < cn.length; ++i){
						let sn = cn[i].getAttribute(opt.prefix + "slot-name");
						if(sn){
							code.push(`jst.fx.include.slot($jst, $ctl, ${text2code(sn)}, ${text2code(cn[i].innerHTML)});`, action.tabs);
						}
					}
					node.innerHTML="";
				}
				return code;
			},
			cleanup: function(jst, node, opt, action, code) {
				if (action.value != null) {
					code.push(`jst.fx.include.render($jst, $ctl)`, action.tabs);
				}
				return code;
			}
		},
		{
			name: "slot-data",
			compile: function(jst, node, opt, action, code) {
				if (action.value != null) {
					code.push(`jst.fx.slot.set($jst, $ctl, ${attr2code(action.value)});`, action.tabs);
				}
				return code;
			},
		},
		{
			name: "slot-ref",
			compile: function(jst, node, opt, action, code) {
				if (action.value != null) {
					code.push(`jst.fx.slot.render($jst, $ctl, ${attr2text(action.value)});`, action.tabs);
				}
				return code;
			},
		},
		{
			name: "recursive",
			compile: function(jst, node, opt, action, code) {
				if (action.value != null) {
					action.nest = true;
					code.push(`if(${attr2code(action.value)}){`, action.tabs ++);
				}
				return code;
			},
			cleanup: function(jst, node, opt, action, code) {
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
	function compile(jst, target, opt, dnt, psn) {
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
								if (directives.filter(d => (opt.prefix + d.name) == e.nodeName).length == 0) {
									action.xattrs[e.nodeName] = e.nodeValue;
								}
							} else if (e.nodeValue.indexOf("{{") >= 0 && e.nodeValue.indexOf("}}") > 0) {
								action.xattrs[e.nodeName] = e.nodeValue;
								action.match = true;
							}
						}
					});

					if (action.match) {
						node.setAttribute(opt.prefix + "id-" + jst.id, ++opt.seqno);
						node.setAttribute(opt.prefix + "pid-" + jst.id, (psn==-1)? "x" : psn);
						action.seqno = opt.seqno;
						let cl = code.lines.length;
						code.push(`{`, action.tabs++);
						code.push(`let $ctl=$ctx.get(${opt.seqno})`, action.tabs);
						for (n = 0; n < directives.length; ++n) {
							directive = directives[n];
							if (action.skip || action.remove) {
								node.removeAttribute(opt.prefix + directive.name);
							} else {
								action.value = node.getAttribute(opt.prefix + directive.name);
								if (directive.compile) {
									code.push(directive.compile.call(directive, jst, node, opt, action, new xcode()));
								}
							}
						}
						if (action.remove) {
							code.lines.splice(cl, 2);
							--opt.seqno;
						}
					}
					if (!action.remove && action.recursive && node.hasChildNodes()) {
						if (action.nest) {
							code.push(`$ctx.push(${opt.seqno});`, action.tabs);
						}
						code.push(compile(jst, node, opt, dnt, (action.nest)? opt.seqno : psn), action.tabs);
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
									code.push(directive.cleanup.call(directive, jst, node, opt, action, new xcode()));
								}
								node.removeAttribute(opt.prefix + directive.name);
							}
							dnt[action.seqno] = node;
							code.push("}", --action.tabs);
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

	/* 节点上下文处理 */
	jst.context = function(tpl, el) {
		this.id = tpl.id;
		this.opt = tpl.option;
		this.dnt = tpl.dnt;
		this.ids = this.opt.prefix + "id-" + this.id,
		this.pids = this.opt.prefix + "pid-" + this.id,
		this.dms = {
			children: [],
			pos: -1,
			id: 'x'
		}
		this.build(el, this.dms);
		this.top = this.dms;
		this.stk = [];
	}
	Object.assign(jst.context.prototype, {
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
				let n = document.createComment(this.id);
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

	let templates = {};
	
	/* jst 主类 */
	function jst(template, target, option, parent) {
		let self = this, prop = Object.defineProperty;
		
		// 组件通讯
		let evh = [];
		self.emit = function(msg, data, e){
			if(!e) {
				e = {
					stopPropagation: false,
					preventDefault: false,
					source: self
				}
			} else {
				let callbacks = evh.concat();
				for(let n = 0; n < callbacks.length; ++ n) {
					if(msg == callbacks[n].msg){
						if(callbacks[n].callback.call(self, data, e) === false){
								e.preventDefault = e.stopPropagation = true;
						}
						if(e.preventDefault){
							return;
						}
					}
				}
				if(e.stopPropagation || e.preventDefault){
					return;
				}
			}
			if(self.parent) {
				self.parent.emit.call(self.parent, msg, data, e);
			}
		}
		self.on = function(msg, callback){
			evh.push({msg: msg, callback:callback});
		}
		self.off = function(msg, callback){
			evh = evh.filter(e => !((msg == undefined || e.msg == msg) && (callback == undefined || e.callback == callback)));
		}
		
		prop(self, "children", {
			value: []
		});
		if(arguments.length == 0) {
			prop(self, "parent", {
				value: null
			});
			return;
		}
		
		prop(self, "parent", {
			value: parent? parent : jst.app
		});
		self.parent.children.push(self);
		
		prop(self, "option", {
			value: Object.assign({}, jst.option, option)
		});
		
		prop(self, "awaits", {
			value: []
		});
		
		let prepares = [];
		// 预处理
		Object.keys(jst.prepare).forEach(function(selector, index, array){
			let objs = template.querySelectorAll(selector);
			for(let i=0; i < objs.length; ++ i){
				let r = jst.prepare[selector](self, objs[i], template);
				if(r){
					prepares.push(r);
				}
			}
		});
		
		prop(self, "target", {
			value: target ? target : template
		});
		
		self.ctx = null;
		self.slots = {};

		if(!template.id){
			template.setAttribute("id", uuid(8));
		}
		let ready = Promise.all(prepares).then(()=>{
			prepares.length = 0;
			if(!templates[template.id]){
				self.id = uuid(8);
				let opt = Object.assign({}, jst.option, option, {
					seqno: -1
				}), 
				tmpl = template.cloneNode(true),
				dnt = [],
				code = (new xcode()).push(compile(self, tmpl, opt, dnt, -1),2).toString();
				
				templates[template.id] = Object.freeze({
					dom: tmpl,
					code: code,
					html: tmpl.innerHTML,
					dnt: dnt,
					option: opt,
					id: self.id,
					executor: new Function("$jst", "$ctx", "$data", "$target", "\twith($data){\r\n" + code + "\r\n\t}")
				});
				delete self.id;
			} 
			prop(self, "template", {
				value: templates[template.id]
			});
			//console.log(this.template.code);
		});
		
		let renders = 0;
		self.render = function(data, force) {
			self.data = (typeof(data) == 'object')? data : ((self.data)? self.data : {});
			self.force = (force===true)? true : self.force;
			if(renders > 0) {
				return ready;
			}
			++ renders;
			ready = ready.then(function(){
				if (self.template.dnt.length > 0 && (self.force || !self.ctx)) {
					self.target.innerHTML = self.template.html;
					self.ctx = new jst.context(self.template, self.target);
					//console.log(this.ctx);
				}
				if(self.ctx){
					self.ctx.init();
				}
				self.awaits.length = 0;
				self.template.executor(self, self.ctx, self.data, self.target);
				self.force = false;
				return new Promise(function (resolve, reject) {
				    setTimeout(function () {
				        Promise.all(self.awaits).then(function(){
							renders = 0;
							if(self.option.callback) {
								self.option.callback();
							}
							resolve();
						});
				    }, 0);
				});
			});
			return ready;
		};
		
		self.refresh = function(force){
			return self.render(self.data, force);
		};
	}
	jst.app = new jst();
	
	jst.option = {
		skipText: false,
		prefix: 'jst-',
		textTag: 'text'
	};
	
	/* 指令的执行代码 */
	jst.fx = {
		data: function(node, name, value) {
			node.jstdata = node.jstdata || {};
			if (arguments.length == 2) {
				return node.jstdata[name];
			} else if (arguments.length == 3) {
				if(node.jstdata[name] != value) {
					node.jstdata[name] = value;
					return true;
				}
				return false;
			}
		},
		attr: function(node, name, value) {
			if (arguments.length == 2) {
				return node.getAttribute(name);
			}
			let tagName = node.nodeName.toLocaleLowerCase();
			name = name.toLocaleLowerCase();
			if ((special_attributes[tagName] && special_attributes[tagName].has(name)) || special_attributes['*'].has(name)) {
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
		},
		text: function(ctl, txt){
			let s = jst.fx.data(ctl, "$fx_text"); 
			if(s == null || s != txt){
				ctl.innerText = txt;
				jst.fx.data(ctl, "$fx_text", txt);
			}
		},
		html: function(ctl, txt){
			let s = jst.fx.data(ctl, "$fx_html"); 
			if(s == null || s != txt){
				ctl.innerHTML = txt;
				jst.fx.data(ctl, "$fx_html", txt);
			}
		},
		selected: function(ctl, value){
			if(Array.isArray(value)){
				if(ctl.multiple){
					let values = value.map(v => "" + v);
					for (let i = 0; i < ctl.options.length; i++){
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
			for (let i = 0; i < ctl.options.length; i++){
				if (ctl.options[i].value == value) {
					ctl.options[i].selected = true;
					break;
				}
			}
		},
		bindfx : function() {
			let ctl = this, setter = jst.fx.data(ctl, '$jst-bind-set'), jsto = jst.fx.data(ctl, '$jst-bind-jst'), conv = jst.fx.data(ctl, '$jst-bind-converter');
			if(ctl.tagName == 'INPUT') {
				if(ctl.type.toLowerCase() == "radio"){
					setter(ctl.value);
				} else if(ctl.type.toLowerCase() == "checkbox") {
					let list = [], checked = jsto.target.querySelectorAll(`input[name=${ctl.name}]:checked`),
					chkbox = jsto.target.querySelectorAll(`input[name=${ctl.name}]`);
					if(chkbox.length == 1){
						if(chkbox[0].value == "true") {
							setter(checked.length == 1? true : false);
						} else if(chkbox[0].value == "1") {
							setter(checked.length == 1? 1 : 0);
						} else if(chkbox[0].value == "on") {
							setter(checked.length == 1? "on" : "off");
						} else if(chkbox[0].value == "yes") {
							setter(checked.length == 1? "yes" : "no");
						} else {
							setter(checked.length == 1? chkbox[0].value : null);
						}
					} else {
						for(let i=0; i < checked.length; ++ i){
							list.push(checked[i].value);
						}
						setter(list);					
					}
				} else if(ctl.type.toLowerCase() == "image") {
				} else if(ctl.type.toLowerCase() == "button") {
				} else if(ctl.type.toLowerCase() == "reset") {
				} else if(ctl.type.toLowerCase() == "submit") {
				} else if(ctl.type.toLowerCase() == "file") {		
				} else if(ctl.type.toLowerCase() == "number") {		
					setter(ctl.value - 0);
				} else if(ctl.type.toLowerCase() == "range") {		
					setter(ctl.value - 0);
				} else {
					setter((conv)? conv.setter(ctl.value, ctl) : ctl.value);
				}
			} else if(ctl.tagName == 'TEXTAREA') {
				setter((conv)? conv.setter(ctl.value, ctl) : ctl.value);
			} else if(ctl.tagName == 'SELECT') {
				if(ctl.multiple) {
					let list=[];
					for(let i=0; i < ctl.options.length; ++ i){
						if(ctl.options[i].selected) {
							list.push(ctl.options[i].value);
						}
					}
					setter(list);
				} else {
					for(let i=0; i < ctl.options.length; ++ i){
						if(ctl.options[i].selected){
							setter(ctl.options[i].value);
							break;
						}
					}
				}
			}
			jst.fx.data(ctl, '$jst-bind-jst').render();
		},
		bind: function(parent, ctl) {
			let value = jst.fx.data(ctl, '$jst-bind-get')(), conv = jst.fx.data(ctl, '$jst-bind-converter'), setter = false;
			if(ctl.tagName == 'INPUT') {
				if(ctl.type.toLowerCase() =="radio"){
					ctl.checked = value == ctl.value;
					setter = 'change';
				} else if(ctl.type.toLowerCase() == "checkbox") {
					ctl.checked = Array.isArray(value)? value.indexOf(ctl.value) > -1 : (""+value) == (""+ctl.value);
					setter = 'change';
				} else if(ctl.type.toLowerCase() == "image") {
					ctl.src = value;
					setter = 'input';
				} else if(ctl.type.toLowerCase() == "button") {
				} else if(ctl.type.toLowerCase() == "reset") {
				} else if(ctl.type.toLowerCase() == "submit") {
				} else if(ctl.type.toLowerCase() == "file") {		
				} else if(ctl.type.toLowerCase() == "text") {		
					ctl.value = (conv)? conv.getter(value, ctl) : value;
					setter = 'input';
				} else {
					ctl.value = value;
					setter = 'input';
				}
			} else if(ctl.tagName == 'TEXTAREA') {
				ctl.value = (conv)? conv.getter(value, ctl) : value;
				setter = 'input';
			} else if(ctl.tagName == 'SELECT') {
				if(ctl.multiple) {
					for(let i=0; i < ctl.options.length; ++ i){
						if(value.indexOf(ctl.options[i].value) > -1){
							ctl.options[i].selected = true;
						}
					}
				} else {
					for(let i=0; i < ctl.options.length; ++ i){
						if(ctl.options[i].value == value){
							ctl.options[i].selected = true;
							break;
						}
					}
				}
				setter = 'change';
			}
			if(setter) {
				ctl.removeEventListener(setter, jst.fx.bindfx);
				ctl.addEventListener(setter, jst.fx.bindfx);
			}
		},
		each: function(item, name, fn){
			let ary = item;
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
		slot: {
			set: function(parent, ctl, value){
				jst.fx.data(ctl, '$jst-slot-data', value);
			},
			render: function(parent, ctl, name){
				let html = parent.slots[name],
					slot = jst.fx.data(ctl, '$jst-slot-jst'),
					refresh = !(jst.fx.data(ctl, '$jst-slot-name', name) && jst.fx.data(ctl, '$jst-slot-html', html));
				if(refresh || slot == null) {
					let dom = document.createElement("div");
					dom.innerHTML = html;
					slot = new jst(dom, ctl, parent.option, parent);
					jst.fx.data(ctl, '$jst-slot-jst', slot);
					refresh = true;
				}
				parent.awaits.push(slot.render(jst.fx.data(ctl, '$jst-slot-data') || parent.data, refresh));
			}
		},
		include: {
			set: function(parent, ctl, name, value){
				jst.fx.data(ctl, '$jst-include-' + name, value);
			},
			slot: function(parent, ctl, name, value){
				let slots = jst.fx.data(ctl, '$jst-include-slots') || {};
				slots[name] = value;
				jst.fx.data(ctl, '$jst-include-slots', slots);
			},
			render: function(parent, ctl){
				let inc = {
					name: jst.fx.data(ctl, '$jst-include-name'),
					data: jst.fx.data(ctl, '$jst-include-data'),
					slots: jst.fx.data(ctl, '$jst-include-slots') || {},
					refresh: jst.fx.data(ctl, '$jst-include-refresh'),
					option: jst.fx.data(ctl, '$jst-include-option'),
					jst: jst.fx.data(ctl, '$jst-include-jst')
				};
				if(jst.fx.data(ctl, '$jst-include-pre', inc.name)){
					if(inc.jst) {
						let i = parent.children.indexOf(inc.jst);
						if (i > -1) {
							parent.children.splice(i, 1);
						}
					}
					jst.locator(inc.name).then(function(dom){
						if(dom.id == inc.name){
							inc.jst = new jst(dom, ctl, inc.option, parent);
							inc.jst.slots = inc.slots;
							jst.fx.data(ctl, '$jst-include-jst', inc.jst);
							parent.awaits.push(inc.jst.render(inc.data,inc.refresh));
						}
					});
				} else {
					inc.jst.slots = inc.slots;
					parent.awaits.push(inc.jst.render(inc.data, inc.refresh));
				}
			}
		}
	}
	
	jst.prepare = {
		'script[type="script/jst"]': function(jst, elm, template){
			let node = document.createElement("div");
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
		if(jst.locator.fetch[name]){
			return jst.locator.fetch[name];
		}
		let dom = document.createElement("div");
		dom.innerText=`template name:${name} not found`;
		dom.id = name;
		
		let url = jst.locator.map[name];
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
			jst.locator.fetch[name] = fetch(url, {credentials: 'include'}).then(response => response.text()).then(t => {
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
						if(n.getAttribute("src")){
							n.setAttribute("src", normalizeUrl(n.getAttribute("src")));
						}
						document.head.appendChild(n);
					}else{
						document.body.appendChild(n);
					}
					n = m;
				}
				return dom;
			}).catch(() => dom);
		}else{
			jst.locator.fetch[name] = new Promise(function(resolve, reject){
				let elm = document.getElementById(name);
				resolve(elm == null? dom : elm);
			});
		}
		return jst.locator.fetch[name];
	};
	jst.locator.map = {};
	jst.locator.fetch = {};
	
	
	
	// 消息总线
	let msgbus = {
		messages: [], 
		callbacks:[]
	}
	function dispatch() {
		if(dispatch.timer == undefined){
			dispatch.timer = setTimeout(function(){
				let msgs = msgbus.messages.concat(), callbacks = msgbus.callbacks.concat();
				msgbus.messages = [];
				dispatch.timer = undefined;
				for(let i = 0; i < msgs.length; ++ i) {
					for(let n = 0; n < callbacks.length; ++ n) {
						if(msgs[i].msg == callbacks[n].msg){
							callbacks[n].callback(msgs[i].data);
						}
					}
				}
			}, 1);
			return;
		}
	}
	jst.publish = function(msg, data){
		msgbus.messages.push({msg: msg, data: data});
		dispatch();
	}
	jst.subscribe = function(msg, callback){
		msgbus.callbacks.push({msg:msg, callback: callback});
	}
	jst.unsubscribe = function(msg, callback){
		msgbus.callbacks = msgbus.callbacks.filter(e => !(e.msg == msg && e.callback == callback));
	}
	
	jst.special_attributes = special_attributes;
	jst.directives = directives;
	jst.xcode = xcode;
	jst.uuid = uuid;
	jst.attr2code = attr2code;
	jst.attr2text = attr2text;
	jst.text2code = text2code;
	
	window.jst = jst;
})();
