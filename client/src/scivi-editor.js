
window.$ = require("jquery");
window.jQuery = $;
require("jquery-ui/ui/version");
require("jquery-ui/ui/ie");
require("jquery-ui/ui/data");
require("jquery-ui/ui/plugin");
require("jquery-ui/ui/focusable");
require("jquery-ui/ui/keycode");
require("jquery-ui/ui/position");
require("jquery-ui/ui/safe-active-element");
require("jquery-ui/ui/safe-blur");
require("jquery-ui/ui/scroll-parent");
require("jquery-ui/ui/disable-selection");
require("jquery-ui/ui/tabbable");
require("jquery-ui/ui/unique-id");
require("jquery-ui/ui/widget");
require("jquery-ui/ui/widgets/button");
require("jquery-ui/ui/widgets/mouse");
require("jquery-ui/ui/widgets/draggable");
require("jquery-ui/ui/widgets/resizable");
require("jquery-ui/ui/widgets/dialog");
require("jquery-ui/ui/widgets/slider");
require("jquery-ui/ui/widgets/tabs");
require("jquery-ui/ui/widgets/progressbar");
require("jquery-contextmenu");
require("jquery.cookie");
var Split = require("split.js");
var D3NE = require("d3-node-editor");
var FileSaver = require("file-saver");

const VISUALIZATION_MODE = 1;
const IOT_PROGRAMMING_MODE = 2;
const MIXED_MODE = 3;

module.exports = SciViEditor;

function SciViEditor()
{
    SciViEditor.prototype.components = {};
    SciViEditor.prototype.componentsByUID = {};
    SciViEditor.prototype.sockets = {};
    SciViEditor.prototype.editor = null;
    SciViEditor.prototype.engine = null;
    SciViEditor.prototype.inVisualization = false;
    SciViEditor.prototype.visuals = null;
    SciViEditor.prototype.comms = {};
    SciViEditor.prototype.commsReconnects = {};
    SciViEditor.prototype.addressCorrespondences = {};
    SciViEditor.prototype.mode = null;
    SciViEditor.prototype.selectedNode = null;
    SciViEditor.prototype.command_socket = null;
}

SciViEditor.prototype.run = function (mode)
{
    var _this = this;
    var container = $("#scivi_node_editor")[0];
    var components = $.map(this.components, function(value, key) { return value });
    var editor = new D3NE.NodeEditor("SciViNodeEditor@0.1.0", container, components);
    var engine = new D3NE.Engine("SciViNodeEditor@0.1.0", components);
    var processingAllowed = true;

    this.mode = mode;
    this.selectedNode = null;

    Split(["#scivi_editor_left", "#scivi_editor_right"], {
        gutterSize: 8,
        sizes: [12, 88],
        minSize: 0,
        onDrag: function () { editor.view.resize(); }
    });
    Split(["#scivi_editor_top", "#scivi_editor_bottom"], {
        gutterSize: 8,
        direction: 'vertical',
        sizes: [85, 15],
        minSize: 0,
        onDrag: function () { editor.view.resize(); }
    });

    $("#scivi_btn_visualize").html(this.runButtonName(mode));

    editor.view.resize();

    editor.view.areaClick = function () {
        if (editor.view.pickedOutput !== null)
            editor.view.pickedOutput = null;
        else {
            editor.selected.clear();
            _this.selectNode(null);
            _this.selectedNode = null;
        }
        editor.view.update();
    };

    editor.eventListener.on("nodeselect", function (node) {
        if (node !== _this.selectedNode) {
            _this.selectedNode = node;
            _this.selectNode(node);
        }
    });

    editor.eventListener.on("noderemove", function (node) {
        _this.selectedNode = null;
        _this.selectNode(null);
    });

    editor.eventListener.on("connectioncreate connectionremove", function () {
        if (processingAllowed) {
            setTimeout(function () {
                _this.process();
                if (_this.selectedNode)
                    _this.updateWidgets(_this.selectedNode);
            }, 1);
        }
    });

    editor.eventListener.on("nodecreate noderemove", function () {
        if (processingAllowed) {
            setTimeout(function() {
                _this.process();
            }, 1);
        }
    });

    $("#scivi_btn_rmnode").click(function () {
        var nodes = editor.selected.getNodes();
        if (nodes.length > 0)
            editor.removeNode(nodes[0]);
    });

    $("#scivi_btn_visualize").click(function (e) {
        if (_this.inVisualization && e.shiftKey) {
            var filename = prompt("Enter name of file to save", "task.ont");
            if (!filename)
                return;
            if (!filename.includes("."))
                filename += ".ont";
            FileSaver.saveAs(new Blob([JSON.stringify(_this.taskOnto)], {type: 'text/plain;charset=utf-8'}), filename);
        } else {
            _this.startVisualization();
        }
    });

    $("#scivi_btn_save").click(function() {
        var filename = prompt("Enter name of file to save", "dataflow.json");
        if (!filename)
            return;
        if (!filename.includes("."))
            filename += ".json";
        var content = JSON.stringify(editor.toJSON(), function(key, value) {
            return key === "cache" ? undefined : value;
        });
        FileSaver.saveAs(new Blob([content], {type: 'text/plain;charset=utf-8'}), filename);
    });

    $("#scivi_btn_load").click(function() {
        processingAllowed = false;
        var element = document.createElement("input");
        element.setAttribute("type", "file");
        element.addEventListener("change", function () {
            var reader = new FileReader();
            reader.onload = async function (e) {
                if (_this.selectedNode) {
                    _this.selectedNode = null;
                    _this.selectNode(null);
                }
                await editor.fromJSON(JSON.parse(e.target.result));
                _this.extendNodes();
                processingAllowed = true;
            };
            reader.readAsText(element.files[0]);
        }, false);
        element.click();
    });

    /*$("#scivi_btn_fs").click(function() {
        if (document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement) {
            if (document.exitFullscreen)
                document.exitFullscreen();
            else if (document.mozCancelFullScreen)
                document.mozCancelFullScreen();
            else if (document.webkitExitFullscreen)
                document.webkitExitFullscreen();
            else if (document.msExitFullscreen)
                document.msExitFullscreen();
        } else {
            var element = document.getElementById("embrace");
            if (element.requestFullscreen)
                element.requestFullscreen();
            else if (element.mozRequestFullScreen)
                element.mozRequestFullScreen();
            else if (element.webkitRequestFullscreen)
                element.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
            else if (element.msRequestFullscreen)
                element.msRequestFullscreen();
        }
    });*/

    /*$("#scivi_btn_poll").click(function() {
        // FIXME: address.
        _this.startComm("ws://192.168.4.1:81/", {}, [ 0xE1 ]);
    });*/

    this.editor = editor;
    this.engine = engine;

    this.visuals = [];

    var urlParams = new URLSearchParams(window.location.search);
    var preset = urlParams.get("preset");
    var autorun = urlParams.get("start");
    if (preset) {
        $(".loader").show();
        $.getJSON("preset/" + preset, async function (data) {
            $(".loader").hide();
            await editor.fromJSON(data);
            _this.extendNodes();
            if (autorun)
                _this.startVisualization();
        });
    }
    
    //--------------- connect to server -----------------
    let addr = document.URL.split(':')[1].slice(2);
    this.command_socket = new WebSocket("ws://" + addr + ":" + $.cookie("CommandServerPort"));
    this.command_socket.onopen = (event) => 
    {
        console.log('Connected to command server');
    };
    this.command_socket.onclose = (event)=> 
    {
        if (event.wasClean)
            console.log(`Connection with command server was closed. Code=${event.code}, reason = ${event.reason}`);
        else
        alert('Connection was broken');
    };
    this.command_socket.onerror = (error) => 
    {
        alert(`Command Server Error(${error.code}): ${error.message}`);
    };
    this.command_socket.onmessage = (event) =>
    {
        var msg = JSON.parse(event.data);
        switch(msg.command)
        {
            case 'wait_for_initialization': {
                let progress = msg.progress;
                $("#scivi_load_progressbar").progressbar({value: progress});
            } break;
            default: console.warn('Unknown message from command server', msg); break;
        }
    };
    

}

SciViEditor.prototype.startVisualization = function ()
{
    if (!this.inVisualization) 
    {
        if (this.mode == VISUALIZATION_MODE)// no wait server if it's just visualization mode
        {
            this.inVisualization = true;
            this.clearViewport();
            this.process();
            $(".scivi_slide").css({"transform": "translateX(-100%)"});
            $("#scivi_btn_visualize").html("◀");
            $("#scivi_btn_visualize").css({"padding-left": "10px", "padding-right": "10px"});
            $(".scivi_menu").css({"margin-left": "20px"});
        }
        else
        {
            document.getElementById('scivi_loadscreen').style.display = 'block';
            $("#scivi_load_progressbar").progressbar({
                        value: 0.0,
                        max: 1.0
                    });
            //load dfd to server
            if (this.mode == IOT_PROGRAMMING_MODE) 
                this.uploadEON();
            else if (this.mode == MIXED_MODE) 
                this.runMixed();
        }
        
    } else {
        this.inVisualization = false;
        this.clearViewport();
        this.process();
        $(".scivi_slide").css({"transform": "translateX(0%)"});
        $("#scivi_btn_visualize").html(this.runButtonName(this.mode));
        $("#scivi_btn_visualize").css({"padding-left": "15px", "padding-right": "10px"});
        $(".scivi_menu").css({"margin-left": "calc(100vw - 120px)"});
        if (this.mode == MIXED_MODE) {
            this.stopMixed();
        }
    }
}

SciViEditor.prototype.uploadEON = function ()
{
    // FIXME: this mode is deprecated.
    var content = JSON.stringify(this.editor.toJSON(), function(key, value) {
        return key === "cache" ? undefined : value;
    });
    var _this = this;
    $.post("/gen_eon", content, function (data) {
        document.getElementById('scivi_loadscreen').style.display = 'none';
        if (data["error"]) {
            _this.showError(data["error"]);
            return;
        }

        this.inVisualization = true;
        this.clearViewport();
        this.process();
        $(".scivi_slide").css({"transform": "translateX(-100%)"});
        $("#scivi_btn_visualize").html("◀");
        $("#scivi_btn_visualize").css({"padding-left": "10px", "padding-right": "10px"});
        $(".scivi_menu").css({"margin-left": "20px"});

        var ont = data["ont"];
        var eon = data["eon"];

        var upEonDiv = $("<div class='scivi_upload_eon'>");
        var ontoDiv = $("<div style='display: table-row;'>");
        var ontoLbl = $("<div style='display: table-cell;'>").html("Task ontology: " + ont["nodes"].length + " nodes, " + ont["relations"].length + " edges");
        var dlOntoBtn = $("<button class='ui-widget scivi_button' style='display: table-cell;'>").html("Download");
        var eonDiv = $("<div style='display: table-row;'>").html("EON blob: " + eon.length + " bytes");
        var uplDiv = $("<div style='display: table-row;'>");
        var uplAddr = $("<div style='display: table-cell;'>");
        var targetAddressLbl = $("<label>").html("Device address: ");
        var targetAddressTxt = $("<input class='ui-widget' type='text' value='192.168.4.1:81' style='margin-right: 5px;'>");
        var uploadBtn = $("<button class='ui-widget scivi_button' style='display=table-cell;'>").html("Upload");

        dlOntoBtn.click(function () {
            var filename = prompt("Enter name of file to save", "task.ont");
            if (!filename)
                return;
            if (!filename.includes("."))
                filename += ".ont";
            FileSaver.saveAs(new Blob([JSON.stringify(ont)], {type: 'text/plain;charset=utf-8'}), filename);
        });

        uploadBtn.click(function () {
            console.log(targetAddressTxt.val());
            var webSocket = new WebSocket("ws://" + targetAddressTxt.val());
            webSocket.onopen = function(evt) {
                console.log("WebSocket open");
                console.log(eon);
                webSocket.send(Uint8Array.from(eon));
                webSocket.close();
            };
            webSocket.onclose = function(evt) { console.log("WebSocket close"); };
            webSocket.onerror = function(evt) { console.log(evt); };
            webSocket.onmessage = function(evt) { console.log(evt); };
        });

        ontoDiv.append(ontoLbl);
        ontoDiv.append(dlOntoBtn);

        uplAddr.append(targetAddressLbl);
        uplAddr.append(targetAddressTxt);

        uplDiv.append(uplAddr);
        uplDiv.append(uploadBtn);

        upEonDiv.append(ontoDiv);
        upEonDiv.append(eonDiv);
        upEonDiv.append(uplDiv);

        $("#scivi_viewport").empty();
        $("#scivi_viewport").append(upEonDiv);
    });
}

SciViEditor.prototype.runMixed = function ()
{
    var content = JSON.stringify(this.editor.toJSON(), function(key, value) {
        return key === "cache" ? undefined : value;
    });
    $.post("/gen_mixed", content, (data) => {
        document.getElementById('scivi_loadscreen').style.display = 'none';
        if (data["error"]) 
        {
            this.showError(data["error"]);
            return;
        }
        this.inVisualization = true;
        this.clearViewport();
        this.process();
        $(".scivi_slide").css({"transform": "translateX(-100%)"});
        $("#scivi_btn_visualize").html("◀");
        $("#scivi_btn_visualize").css({"padding-left": "10px", "padding-right": "10px"});
        $(".scivi_menu").css({"margin-left": "20px"});

        var ont = data["ont"];
        var cor = data["cor"];
        var eon = data["eon"];
        var srvAddr = data["srvAddr"];

        this.taskOnto = ont;

        
        if (Object.keys(cor).length > 0) 
        {
            if (eon.length > 0) {
                eon.unshift(0xE0);
                // FIXME: address should be given by server, moreover, there may be multiple comms required.
                this.startComm("ws://192.168.4.1:81/", cor, eon);
            } else {
                this.startComm("ws://" + srvAddr + ":5001/", cor);
            }
        }
    });
}

SciViEditor.prototype.stopMixed = function ()
{
    this.cleanupComms();
    $.post("/stop_execer", {}, (data) => { if (data["error"]) this.showError(data["error"]); });
}

SciViEditor.prototype.registerNode = function (name, uid, inputs, outputs, workerFunc, settingsFunc)
{
    var _this = this;
    var sockets = this.sockets;
    var node = new D3NE.Component(name,
    {
        builder(node) {
            inputs.forEach(function (item) {
                if (sockets[item["type"]] === undefined)
                    sockets[item["type"]] = new D3NE.Socket(item["type"], item["type"], "");
                node.addInput(new D3NE.Input(item["name"], sockets[item["type"]]));
            });
            outputs.forEach(function (item) {
                if (sockets[item["type"]] === undefined)
                    sockets[item["type"]] = new D3NE.Socket(item["type"], item["type"], "");
                node.addOutput(new D3NE.Output(item["name"], sockets[item["type"]]));
            });
            settingsFunc(node);
            if (node.inlineSettingsCtrl !== undefined) {
                node.addControl(new D3NE.Control("<div></div>", function (element, control) {
                    element.appendChild(node.inlineSettingsCtrl);
                }));
            }
            return node;
        },
        worker(node, inputs, outputs) {
            try {
                workerFunc(node, inputs, outputs);
            } catch(err) {
                _this.showError(err);
            }
        }
    });
    node.syncSettings = settingsFunc;
    this.components[name] = node;
    this.componentsByUID[uid] = node;
}

SciViEditor.prototype.createNodeFromProto = function (nodeProto, position)
{
    var node = nodeProto.builder(nodeProto.newNode());
    node.position = position;
    node.syncSettings = nodeProto.syncSettings;
    this.editor.addNode(node);
    this.editor.view.update();
    return node;
}

SciViEditor.prototype.createNode = function (name)
{
    var container = $("#scivi_node_editor")[0];
    this.createNodeFromProto(this.components[name],
                             [(container.clientWidth / 2 - this.editor.view.transform.x) / this.editor.view.transform.k,
                              (container.clientHeight / 2 - this.editor.view.transform.y) / this.editor.view.transform.k]);
}

SciViEditor.prototype.selectNode = function (node)
{
    if (node) {
        $("#scivi_settings_title").html(node.title);
        $("#scivi_settings_title").show();
        $("#scivi_btn_rmnode").show();
        $("#scivi_settings_content").empty();
        node.syncSettings(node);
        if (node.settingsCtrl)
            $("#scivi_settings_content").append($(node.settingsCtrl));
    } else {
        $("#scivi_settings_title").hide();
        $("#scivi_btn_rmnode").hide();
        $("#scivi_settings_content").empty();
    }
}

SciViEditor.prototype.extendNodes = function ()
{
    var _this = this;
    this.editor.nodes.forEach(function (node) {
        if (!node.syncSettings) {
            var nodeProto = _this.components[node.title];
            node.syncSettings = nodeProto.syncSettings;
        }
        if (node.data.subTitle) { // FIXME: this is deprecated!!!
            $("#t" + node.id).val(node.data.subTitle);
            $("#t" + node.id).show();
        }
    });
}

SciViEditor.prototype.process = function ()
{
    function dumpToArray(nodes)
    {
        var result = [];
        for (key in nodes) {
            if (nodes.hasOwnProperty(key))
                result.push(nodes[key]);
        }
        return result;
    }

    function getSourceNodes(nodes, node, remRec)
    {
        var result = [];
        for (var i = 0, n = node.inputs.length; i < n; ++i) {
            if (node.inputs[i].connections.length > 0) {
                var src = nodes[node.inputs[i].connections[0].node];
                if (!remRec || src.position[0] < node.position[0] || (src.position[0] === node.position[0] && src.position[1] < node.position[1]))
                    result.push(src);
            }
        }
        return result;
    }

    function getMaxRank(nodes)
    {
        var result = -1;
        for (var i = 0, n = nodes.length; i < n; ++i) {
            if (nodes[i].rank === undefined)
                return undefined;
            else if (nodes[i].rank > result)
                result = nodes[i].rank;
        }
        return result;
    }

    var dfd = this.editor.toJSON();
    var nodes = dumpToArray(dfd.nodes);
    var rankedNodes = 0;
    var n = nodes.length;
    var removeRecursives = false;
    while (rankedNodes < n) {
        var hasCycle = true;
        for (var i = 0; i < n; ++i) {
            if (nodes[i].rank !== undefined)
                continue;
            var srcNodes = getSourceNodes(dfd.nodes, nodes[i], removeRecursives);
            if (srcNodes.length === 0) {
                nodes[i].rank = 0;
                ++rankedNodes;
                hasCycle = false;
            } else {
                var mr = getMaxRank(srcNodes);
                if (mr !== undefined) {
                    nodes[i].rank = mr + 1;
                    ++rankedNodes;
                    hasCycle = false;
                }
            }
        }
        removeRecursives = hasCycle;
    }

    nodes.sort(function (a, b) {
        return a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0;
    });

    for (var i = 0; i < n; ++i) {
        var node = this.getNodeByID(nodes[i].id);
        var inputs = [];
        for (var j = 0, m = nodes[i].inputs.length; j < m; ++j) {
            if (nodes[i].inputs[j].connections.length > 0) {
                var srcNodeID = nodes[i].inputs[j].connections[0].node;
                var srcOutputID = nodes[i].inputs[j].connections[0].output;
                var srcNode = this.getNodeByID(srcNodeID);
                if (srcNode.outputData)
                    inputs.push([srcNode.outputData[srcOutputID]])
                else
                    inputs.push([null]);
            } else {
                inputs.push([]);
            }
        }
        var outputs = [];
        for (var j = 0, m = nodes[i].outputs.length; j < m; ++j)
            outputs.push(null);
        this.components[nodes[i].title].worker(node, inputs, outputs);
        node.outputData = outputs;
    }
}

SciViEditor.prototype.viewportContainer = function ()
{
    return document.getElementById("scivi_viewport");
}

SciViEditor.prototype.placeVisual = function (desiredDepth, currentDepth, rootContainer, visualContainers, conID, forceDir)
{
    var dir = forceDir === undefined ? (currentDepth % 2 === 0 ? "vertical" : "horizontal") : forceDir;
    var d1, d2;
    var id1 = "_" + conID + "_1";
    var id2 = "_" + conID + "_2";
    conID[0]++;
    d1 = $("<div class='split split-" + dir + "' id='" + id1 + "'>");
    d2 = $("<div class='split split-" + dir + "' id='" + id2 + "'>");

    rootContainer.appendChild(d1[0]);
    rootContainer.appendChild(d2[0]);

    Split(["#" + id1, "#" + id2], {
        gutterSize: 8,
        sizes: [50, 50],
        minSize: 0,
        direction: dir,
        onDrag: function () { window.dispatchEvent(new Event("resize")); }
    });

    if (desiredDepth == currentDepth) {
        visualContainers.push(d1[0]);
        visualContainers.push(d2[0]);
    } else {
        this.placeVisual(desiredDepth, currentDepth + 1, d1[0], visualContainers, conID, forceDir);
        this.placeVisual(desiredDepth, currentDepth + 1, d2[0], visualContainers, conID, forceDir);
    }
}

SciViEditor.prototype.addVisualToViewport = function (el, pos, forceDir)
{
    var vp = this.viewportContainer();
    while (vp.firstChild)
        vp.removeChild(vp.firstChild);
    el.splitIndex = pos[1];
    this.visuals.push(el);
    this.visuals.sort(function (e1, e2) { return e1.splitIndex > e2.splitIndex ? 1 : -1; });
    if (forceDir === "vertical" || (forceDir === undefined && this.forceDir === "vertical")) {
        for (var i = 0, n = this.visuals.length; i < n; ++i)
            vp.appendChild(this.visuals[i]);
        var h = 0;
        for (var i = 0, n = this.visuals.length; i < n; ++i) {
            if (!this.visuals[i].style.height)
                h += $(this.visuals[i].firstChild).outerHeight(true);
        }
        for (var i = 0, n = this.visuals.length; i < n; ++i) {
            if (this.visuals[i].style.height)
                this.visuals[i].style.height = "calc(100% - " + h + "px)";
        }
    } else {
        if (this.visuals.length == 1)
            vp.appendChild(el);
        else
        {
            var visualContainers = [];
            this.placeVisual(Math.ceil(Math.log(this.visuals.length) / Math.log(2)), 1, vp, visualContainers, [0], forceDir);
            for (var i = 0, n = this.visuals.length; i < n; ++i)
                visualContainers[i].appendChild(this.visuals[i]);
        }
    }
    if (forceDir !== undefined)
        this.forceDir = forceDir;
    window.dispatchEvent(new Event("resize"));
}

SciViEditor.prototype.clearViewport = function ()
{
    var vp = this.viewportContainer();
    while (vp.firstChild)
        vp.removeChild(vp.firstChild);
    this.visuals = [];
    this.forceDir = undefined;
}

SciViEditor.prototype.getNodeByID = function (nodeID)
{
    return this.editor.nodes.find(function (node) { return node.id === nodeID; });
}

SciViEditor.prototype.updateWidgets = function (node)
{
    if (this.selectedNode && node.id === this.selectedNode.id)
        this.selectNode(node);
}

SciViEditor.prototype.runButtonName = function (mode)
{
    switch (mode) {
        case VISUALIZATION_MODE:
            return "Visualize ▶";

        case IOT_PROGRAMMING_MODE:
            return "Upload ▶";

        case MIXED_MODE:
            return "Run ▶";
    }
    return "Visualize ▶";
}

SciViEditor.prototype.escapeHTML = function (text)
{
    var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

SciViEditor.prototype.showError = function (err)
{
    console.log(err);
    $("#scivi_error_text").html(this.escapeHTML(err));
    var dlg = $("#scivi_error").dialog({
        modal: true,
        buttons: {
            Ok: function() {
                $(this).dialog("close");
            }
        }
    });
    var dp = dlg.parent();
    dp.css("background", "#FBDAC9").css("border", "1px solid #3F3F3F");
    dp.find(".ui-dialog-buttonpane").css("background", "#FBDAC9").css("border-top", "1px solid #3F3F3F");
    dp.find(".ui-dialog-titlebar").css("background", "#FF4D00").css("color", "#FFFFFF");
    dp.find(".ui-button").css("border", "1px solid #3F3F3F");
}

SciViEditor.prototype.instEdgeNode = function (device, uid, guid, index, count)
{
    const container = $("#scivi_node_editor")[0];
    const x = (container.clientWidth / 2 - this.editor.view.transform.x) / this.editor.view.transform.k;
    const y = (container.clientHeight / 2 - this.editor.view.transform.y) / this.editor.view.transform.k;
    const h = 50;
    var node = this.createNodeFromProto(this.componentsByUID[uid], [x, y - h * count / 2.0 + h * index]);
    node.settingsVal[settingName] = { device: device, guid: guid };
}

SciViEditor.prototype.startComm = function (address, addressCorrespondences, eon = null)
{
    var ws = new WebSocket(address);
    var _this = this;
    this.comms[address] = ws;
    this.addressCorrespondences[address] = addressCorrespondences;
    if (this.commsReconnects[address] === undefined)
        this.commsReconnects[address] = 10;
    Object.keys(addressCorrespondences).forEach(function (key) {
        var cor = addressCorrespondences[key];
        if (cor) {
            for (var j = 0, n = cor.length; j < n; ++j) {
                var isInput = cor[j][1];
                if (isInput) {
                    var dfdNodeID = cor[j][0];
                    var dfdNode = _this.getNodeByID(dfdNodeID);
                    dfdNode.data.txAddress = address;
                }
            }
        }
    });
    ws.onopen = function(evt) {
        console.log("WebSocket open on " + address);
        _this.commsReconnects[address] = -1;
        if (eon) {
            ws.send(Uint8Array.from(eon));
        }
    };
    ws.onclose = function(evt) {
        console.log("WebSocket close on " + address);
        delete _this.comms[address];
    };
    ws.onerror = function(evt) {
        console.log(evt);
        var rc = _this.commsReconnects[address];
        if (rc > 0) {
            --rc;
            _this.commsReconnects[address] = rc;
            setTimeout(function () { _this.startComm(address, addressCorrespondences, eon); }, 100);
        }
    };
    ws.onmessage = function(evt) {
        var msg = JSON.parse(evt.data);
        if (msg.bus !== undefined) {
            // Message contains bus description from the Edge device.
            console.log(msg);
            ws.close();
        } else {
            // Message contains values computed on the remote.
            for (var i = 0, n = msg.length; i < n; ++i) {
                Object.keys(msg[i]).forEach(function (key) {
                    var cor = addressCorrespondences[key];
                    if (cor) {
                        for (var j = 0, n = cor.length; j < n; ++j) {
                            var isInput = cor[j][1];
                            if (!isInput) {
                                var dfdNodeID = cor[j][0];
                                var socketNmb = cor[j][2];
                                var dfdNode = _this.getNodeByID(dfdNodeID);
                                if (!dfdNode.data.outputDataPool)
                                    dfdNode.data.outputDataPool = [];
                                for (var k = dfdNode.data.outputDataPool.length; k <= socketNmb; ++k)
                                    dfdNode.data.outputDataPool.push(null);
                                dfdNode.data.outputDataPool[socketNmb] = msg[i][key];
                            }
                        }
                    }
                });
            }
            _this.process();
        }
    };
}

SciViEditor.prototype.transmitInput = function (address, nodeID, socketID, value)
{
    var ws = this.comms[address];
    var isConnected = this.commsReconnects[address] === -1;
    if (ws && isConnected) {
        var addressCorrespondences = this.addressCorrespondences[address];
        var keys = Object.keys(addressCorrespondences);
        for (var i = 0, n = keys.length; i < n; ++i) {
            var cor = addressCorrespondences[keys[i]];
            if (cor) {
                for (var j = 0, m = cor.length; j < m; ++j) {
                    if (cor[j][0] === nodeID && cor[j][1] && cor[j][2] === socketID) {
                        var msg = {};
                        msg[keys[i]] = value;
                        ws.send(JSON.stringify(msg));
                        break;
                    }
                }
            }
        }
    }
}

SciViEditor.prototype.cleanupComms = function ()
{
    Object.keys(this.comms).forEach((key) => this.comms[key].close());
    this.comms = {};
    this.commsReconnects = {};
    this.addressCorrespondences = {};
    this.editor.nodes.forEach((node)=> node.data.outputDataPool = []);
}

/*SciViEditor.prototype.changeOntoBusAddress = function (settingName, settingID, nodeID)
{
    var device = $("#d_" + settingID.toString() + "_" + nodeID.toString()).get(0).valueAsNumber;
    var guid = $("#g_" + settingID.toString() + "_" + nodeID.toString()).get(0).valueAsNumber;
    var node = this.getNodeByID(nodeID);
    node.data.settingsVal[settingName] = { device: device, guid: guid };
    node.data.settingsChanged[settingName] = true;
}

SciViEditor.prototype.pingByOntoBusAddress = function (settingName, settingID, nodeID)
{
}*/
