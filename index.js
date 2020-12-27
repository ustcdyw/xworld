
var app=angular.module("chatRoom",[]);

app.factory('socket', function($rootScope) {
    var socket = io(); //默认连接部署网站的服务器
    return {
        on: function(eventName, callback) {
            socket.on(eventName, function() {
                var args = arguments;
                $rootScope.$apply(function() {   //手动执行脏检查
                    callback.apply(socket, args);
                });
            });
        },
        emit: function(eventName, data, callback) {
            socket.emit(eventName, data, function() {
                var args = arguments;
                $rootScope.$apply(function() {
                    if(callback) {
                        callback.apply(socket, args);
                    }
                });
            });
        }
    };
});

app.factory('randomColor', function($rootScope) {
    return {
        newColor: function() {
            return '#'+(Math.random()*0xff<<0).toString(16) + (Math.random()*0xff<<0).toString(16) + "80";
        }
    };
});

app.factory('userService', function($rootScope) {
    return {
        get: function(usersA,nickname) {
            if(usersA instanceof Array){
                for(var i=0;i<usersA.length;i++){
                    if(usersA[i].nickname===nickname){
                        return usersA[i];
                    }
                }
            }else{
                return null;
            }
        },
        getIndex: function(usersA,nickname) {
            if(usersA instanceof Array){
                for(var i=0;i<usersA.length;i++){
                    if(usersA[i].nickname===nickname){
                        return i;
                    }
                }
            }else{
                return null;
            }
        }
    };
});

app.controller("chatCtrl",['$scope','socket','randomColor','userService',function($scope,socket,randomColor,userService){
    var messageWrapper= $('.message-wrapper');
    $scope.hasNewMessageFlag=false;
    $scope.scrollForce=true;
    $scope.isChatting=false;
    $scope.headerMenu=false;
    $scope.hasLogined=false;
    $scope.receiver="";//默认是群聊
    $scope.publicMessages=[];//群聊消息
    $scope.privateMessages={};//私信消息
    $scope.messages=$scope.publicMessages;//默认显示群聊
    $scope.users={};//
    $scope.usersA=[];
    $scope.onlineUsers={};
    $scope.color=randomColor.newColor();//当前用户头像颜色

    $scope.login=function(){   //登录进入聊天室
        if (!$scope.nickname) {
            return;
        }
        if (!$scope.password) {
            socket.emit("tmpUser",{nickname:$scope.nickname,color:$scope.color});
            return;
        }
        socket.emit("login",{nickname:$scope.nickname,password:$scope.password,color:$scope.color});
    }

    $scope.register=function(){
        if (!$scope.nickname || !$scope.password) {
            return;
        }
        socket.emit("register",{nickname:$scope.nickname,password:$scope.password,color:$scope.color});
    }

    $scope.scrollToBottom=function(){
        if ($scope.scrollForce) {
            messageWrapper.scrollTop(messageWrapper[0].scrollHeight);
            $scope.scrollForce = false;
            return;
        }
        if (messageWrapper.scrollTop() + messageWrapper[0].offsetHeight > messageWrapper[0].scrollHeight - 200) {
            messageWrapper.scrollTop(messageWrapper[0].scrollHeight);
        }
        return;
    }

    $scope.clickHeaderMenu = function() {
        $scope.headerMenu = !$scope.headerMenu;
    }

    $scope.deleteChat = function() {
        if ($scope.receiver === "" || $scope.isChatting === false) {
            return;
        }
        if ($scope.receiver) {
            $scope.privateMessages[$scope.receiver].length = 0;
        }
        delete $scope.privateMessages[$scope.receiver];
        delete $scope.users[$scope.receiver];
        var idx = userService.getIndex($scope.usersA, $scope.receiver);
        if (idx > -1) {
            $scope.usersA.splice(idx, 1);
        }
        var msg = {type:"deleteChat", nickname:$scope.nickname, peer:$scope.receiver};
        socket.emit("deleteChat", msg);
    }

    $scope.clearChat = function() {
        if ($scope.isChatting === false) {
            return;
        }
        if ($scope.receiver) {
            $scope.privateMessages[$scope.receiver].length = 0;
            var msg = {type:"deleteChat", nickname:$scope.nickname, peer:$scope.receiver};
            socket.emit("deleteChat", msg);
        } else {
            $scope.publicMessages.length = 0;
        }
    }

    $scope.showHeaderMenu = function(sel) {
        if (sel) {
            $scope.headerMenu = true;
        } else {
            $scope.headerMenu = false;
        }
    }

    $scope.postMessage=function(){
        var msg={text:$scope.words,type:"normal",color:$scope.color,from:$scope.nickname,to:$scope.receiver};
        var rec=$scope.receiver;
        if(rec){  //私信
            if(!$scope.privateMessages[rec]){
                $scope.privateMessages[rec]=[];
            }
            $scope.privateMessages[rec].push(msg);
            $scope.users[rec].lastMsgTime = Date.now();
        }else{ //群聊
            $scope.publicMessages.push(msg);
            //$scope.users[""].lastMsgTime = Date.now();
        }
        $scope.words="";
        if(rec!==$scope.nickname) { //排除给自己发的情况
            socket.emit("addMessage", msg);
        }
    }

    $scope.bottlePost = function() {
        var msg={text:$scope.bottleMsg, type:"postBottle", from:$scope.nickname, date:Date().toString()};
        $scope.bottleMsg="";
        socket.emit("bottlePost", msg);
        $scope.bottleThrowSel=false;
    }

    $scope.bottleAddFriend = function() {
        var msg = {
            text:"哈哈，捡到你在 “" + $scope.bottleGetDate
                + "” 扔的瓶子啦。瓶子里写着 “" + $scope.bottleGetMsg + "” ，很高兴认识你!", 
            type:"normal",
            color:$scope.color,
            from:$scope.nickname,
            to:$scope.bottleGetUser
        };
        var rec = $scope.bottleGetUser;
        $scope.bottleGetSel = false;
        $scope.driftBottleSelected = false;
        $scope.chatRoomSelected = true;
        $scope.setReceiver(rec);

        $scope.privateMessages[rec].push(msg);
        $scope.users[rec].lastMsgTime = Date.now();
        $scope.words="";
        if(rec!==$scope.nickname) { //排除给自己发的情况
            socket.emit("addMessage", msg);
        }
    }

    $scope.setReceiver=function(receiver){
        $scope.isChatting=true;
        $scope.receiver=receiver;
        if(receiver){ //私信用户
            if(!$scope.users[receiver]) {
                var userColor = "#eeeeee";
                if ($scope.onlineUsers[receiver]) { //从隐藏的在线列表中获取color
                    userColor = $scope.onlineUsers[receiver].color;
                }
                var user = {
                    color: userColor,
                    nickname: receiver,
                    hasNewMessage: false,
                };
                $scope.users[receiver] = user;
                $scope.usersA.push(user);
            }
            if(!$scope.privateMessages[receiver]){
                $scope.privateMessages[receiver]=[];
            }
            $scope.messages=$scope.privateMessages[receiver];
        }else{//广播
            $scope.messages=$scope.publicMessages;
        }
        var user=$scope.users[receiver];
        if(user){
            user.hasNewMessage=false;
        }
        $scope.scrollForce = true;
    }

    $scope.clickTest=function() {
        console.log("click test");
    }

    $scope.clickUser=function(self, info) {
        if (self === info.from) {
            return;
        }
        if ($scope.receiver != info.from) {
            $scope.setReceiver(info.from);
        }
    }

    $scope.selectPage=function(name) {
        if (name === "chat") {
            $scope.chatRoomSelected = true;
            $scope.driftBottleSelected = false;
        } else if (name === "bottle") {
            $scope.chatRoomSelected = false;
            $scope.driftBottleSelected = true;
        }
    }

    $scope.throwBottle=function() {
        $scope.bottleThrowSel = true;
        $scope.bottleGetSel = false;
        $scope.bottleGetting = false;
    }

    $scope.getBottle=function() {
        $scope.bottleThrowSel = false;
        $scope.bottleGetSel = false;
        $scope.bottleGetting = true;
        var msg={type:"getBottle", from:$scope.nickname};
        socket.emit("bottleGet", msg);
    }

    $scope.toTimestamp=function(strDate) {
        var datum = Date.parse(strDate);
        return datum;
    }

    //收到登录结果
    socket.on('userAddingResult',function(data){
        if(data.result){
            $scope.userExisted=false;
            $scope.hasLogined=true;
            $scope.chatRoomSelected=true;
            $scope.driftBottleSelected=false;
            var d =  {nickname:"",color:"#000",lastMsgTime:0xffffffffffff};
            $scope.users={"" : d};
            $scope.usersA.push(d);
        }else{//昵称被占用
            $scope.userExisted=true;
        }
    });

    //有用户上线
    socket.on('userAdded', function(data) {
        if (!$scope.hasLogined) return;
        $scope.publicMessages.push({text:data.nickname,type:"welcome"});
        if (!$scope.users.hasOwnProperty(data.nickname)) { //如果会话列表中没有该用户，什么都不做
            // $scope.users[data.nickname] = data;
            // $scope.usersA.push(data);
        } else { //如果有该用户，改颜色
            $scope.users[data.nickname].color = data.color;
        }
        $scope.onlineUsers[data.nickname] = data;
    });

    //接收所有的在线用户
    socket.on('onlineUser', function(data) {
        if(!$scope.hasLogined) return;
        $scope.onlineUsers=data;
    });

    //有用户退出
    socket.on('userRemoved', function(data) {
        if(!$scope.hasLogined) return;
        $scope.publicMessages.push({text:data.nickname,type:"bye"});
        if ($scope.users[data.nickname]) {
            $scope.users[data.nickname].color = "#eeeeee";
        }
        delete $scope.onlineUsers[data.nickname];
    });

    //接收到新消息
    socket.on('messageAdded', function(data) {
        if(!$scope.hasLogined) return;
        if(data.to){ //私信
            var fromUser = {};
            var userColor = "#eeeeee";
            if ($scope.onlineUsers[data.from]) { //从隐藏的在线列表中获取color
                userColor = $scope.onlineUsers[data.from].color;
            }
            if(!$scope.users.hasOwnProperty(data.from)) { //如果会话列表没有from，创建
                fromUser = {
                    color: data.color ? data.color : userColor,
                    nickname: data.from,
                    hasNewMessage: false,
                };
                $scope.users[data.from] = fromUser;
                $scope.usersA.push(fromUser)
            } else { //如果有，找到
                fromUser = $scope.users[data.from];
                fromUser.color = data.color ? data.color : userColor;
            }
            if(!$scope.privateMessages[data.from]){
                $scope.privateMessages[data.from]=[];
            }
            $scope.privateMessages[data.from].push(data);
            fromUser.lastMsgTime = Date.now();
            if($scope.receiver!==data.from) {//当前聊天的人不是from，提示新消息
                if (fromUser) {
                    fromUser.hasNewMessage = true;//私信
                    if ($scope.isChatting === true) {
                        $scope.hasNewMessageFlag = true;
                    }
                }
            }
        }else{//群发
            var toUser=$scope.users[data.to];
            $scope.publicMessages.push(data);
            if ($scope.receiver !== "") {
                toUser.hasNewMessage = true;//群发
                if ($scope.isChatting === true) {
                    $scope.hasNewMessageFlag = true;
                }
            }
        }
    });

    socket.on('messageAddedMany', function(records) {
        if(!$scope.hasLogined) return;
        console.log(records);
        for (var i = records.length - 1; i >= 0; i--) {
            data = records[i];
            if (data.to === $scope.nickname) { //我是接收者
                var userColor = "#eeeeee";
                if ($scope.onlineUsers[data.from]) { //从隐藏的在线列表中获取color
                    userColor = $scope.onlineUsers[data.from].color;
                }
                if(!$scope.privateMessages[data.from]){
                    $scope.privateMessages[data.from]=[];
                }
                if(!$scope.users.hasOwnProperty(data.from)) { //会话列表没有from，创建
                    var from = {
                        color: userColor,
                        nickname: data.from,
                        hasNewMessage: false,
                        lastMsgTime: $scope.toTimestamp(data.date),
                    };
                    $scope.users[data.from] = from;
                    $scope.usersA.push(from);
                } else { // 更新lastMsg时间
                    var user = $scope.users[data.from];
                    user.lastMsgTime = $scope.toTimestamp(data.date) > user.lastMsgTime
                                       ? $scope.toTimestamp(data.date) : user.lastMsgTime;
                }
                $scope.privateMessages[data.from].push({
                    color: "#eeeeee",
                    from: data.from,
                    to: data.to,
                    text: data.text,
                    type: "normal",
                    date: data.date,
                });
            } else if (data.from === $scope.nickname) { //我是发送者
                var userColor = "#eeeeee";
                if ($scope.onlineUsers[data.to]) { //从隐藏的在线列表中获取color
                    userColor = $scope.onlineUsers[data.to].color;
                }
                if(!$scope.privateMessages[data.to]){
                    $scope.privateMessages[data.to]=[];
                }
                if(!$scope.users.hasOwnProperty(data.to)) {
                    var to = {
                        color: userColor,
                        nickname: data.to,
                        hasNewMessage: false,
                        lastMsgTime: $scope.toTimestamp(data.date),
                    };
                    $scope.users[data.to] = to;
                    $scope.usersA.push(to);
                } else {
                    var user = $scope.users[data.to];
                    user.lastMsgTime = $scope.toTimestamp(data.date) > user.lastMsgTime
                                       ? $scope.toTimestamp(data.date) : user.lastMsgTime;
                }
                $scope.privateMessages[data.to].push({
                    color: "#eeeeee",
                    from: data.from,
                    to: data.to,
                    text: data.text,
                    type: "normal",
                    date: data.date,
                });
            }
        }
    });

    socket.on('bottleGet', function(data) {
        if (data.from === '') {
            $scope.bottleThrowSel = false;
            $scope.bottleGetSel = true;
            $scope.bottleGetting = false;
            $scope.bottleGetMsg = data.text;
            return;
        }
        $scope.bottleThrowSel = false;
        $scope.bottleGetSel = true;
        $scope.bottleGetting = false;
        $scope.bottleGetMsg = data.text;
        $scope.bottleGetUser = data.from;
        $scope.bottleGetDate = data.date.slice(0,24);
    });
}]);

app.directive('message', ['$timeout',function($timeout) {
    return {
        restrict: 'E',
        templateUrl: 'message.html',
        scope:{
            info:"=",
            self:"=",
            scrolltothis:"&"
        },
        link:function(scope, elem, attrs){
                scope.time=new Date();
                $timeout(scope.scrolltothis);
                $timeout(function(){
                    elem.find('.avatar').css('background',scope.info.color);
                });
        }
    };
}])
    .directive('user', ['$timeout',function($timeout) {
        return {
            restrict: 'E',
            templateUrl: 'user.html',
            scope:{
                info:"=",
                iscurrentreceiver:"=",
                setreceiver:"&"
            },
            // link:function(scope, elem, attrs,chatCtrl){
            //     $timeout(function(){
            //         elem.find('.avatar').css('background',scope.info.color);
            //     });
            // }
        };
    }])

;
