var express = require('express');
var app = require('express')();
var http = require('http').createServer(app);
var io = require('socket.io')(http);
var sql = require('./lib/query.js');

app.use(express.static(__dirname + '/public'));


app.get('/', function (req, res) {
    res.sendfile('index.html');
});

var connectedSockets={};
var bottles=[];
var onlineUsers={"": {nickname:"",color:"#000",type:"onlinegroup"}};//初始值即包含"群聊",用""表示nickname
io.on('connection',function(socket){

    socket.on('tmpUser', function(data) {
        if (!data.nickname) {
            console.log("nickname is NULL", data.nickname);
            socket.emit('userAddingResult',{result:false});
            return;
        }

        if(connectedSockets[data.nickname]){//昵称已被占用
            socket.emit('userAddingResult',{result:false});
        }

        var query = "SELECT * from user WHERE ?;"
        body = {
            U_Name: data.nickname,
        };
        sql(query, body, function(err, res) {
            /* TODO */
            if (err) {
                console.log("err", err)
                socket.emit('userAddingResult',{result:false});
            } else if (res) {
                console.log(res, "\n", res.length);
                if (res.length > 0) {
                    socket.emit('userAddingResult',{result:false});
                    return;
                }
                socket.emit('userAddingResult',{result:true});
                data.type="tmpUser";
                socket.nickname=data.nickname;
                connectedSockets[socket.nickname]=socket;//保存每个在线socket实例,发私信需要用
                onlineUsers[data.nickname] = data;
                socket.emit('onlineUser', onlineUsers);
                socket.broadcast.emit('userAdded',data);//广播欢迎新用户,除新用户外都可看到
            }
        });
    });

    socket.on('register',function(data){ //有新用户进入聊天室
        if (!data.nickname || !data.password) {
            console.log("nickname is NULL", data.nickname, data.password);
            return;
        }

        console.log("register");
        if(connectedSockets[data.nickname]){//昵称已被占用
            socket.emit('userAddingResult',{result:false});
        }

        var query = "INSERT INTO user SET ?;"
        body = {
            U_Name: data.nickname,
            U_PassWord: data.password
        };

        sql(query, body, function(err, res) {
            if (err) {
                console.log("error is ", err);
                socket.emit('userAddingResult',{result:false});
            } else if (res) {
                console.log("res is ", res);
                socket.emit('userAddingResult',{result:true});
                data.type="normalUser";
                delete data.password;
                socket.nickname=data.nickname;
                connectedSockets[socket.nickname]=socket;//保存每个在线socket实例,发私信需要用
                onlineUsers[data.nickname] = data;
                socket.emit('onlineUser', onlineUsers);
                socket.broadcast.emit('userAdded',data);//广播欢迎新用户,除新用户外都可看到
            }
        });
    });

    socket.on('login', function(data) {
        if (!data.nickname || !data.password) {
            console.log("nickname is NULL", data.nickname, data.password);
            return;
        }

        // TODO 临时用户一般不可能占用已注册用户的昵称，只能是多地登陆，现在不支持多地登陆
        if(connectedSockets[data.nickname]){//昵称已被占用
            socket.emit('userAddingResult',{result:false});
            return;
        }

        var query = "SELECT * from user WHERE ?;"
        body = {
            U_Name: data.nickname,
        };
        sql(query, body, function(err, res) {
            if (err) {
                console.log("error is ", err);
                socket.emit('userAddingResult',{result:false});
            } else if (res) {
                if (res.length === 0) {
                    console.log("error user not exist");
                    socket.emit('userAddingResult',{result:false});
                    return;
                }

                obj = res[0];
                if (obj.U_PassWord !== data.password) {
                    socket.emit('userAddingResult',{result:false});
                    return;
                }
                delete data.password;
                socket.emit('userAddingResult',{result:true});
                data.type="normalUser";
                socket.nickname=data.nickname;
                connectedSockets[socket.nickname]=socket;//保存每个在线socket实例,发私信需要用
                onlineUsers[data.nickname] = data;
                socket.emit('onlineUser', onlineUsers);
                socket.broadcast.emit('userAdded',data);//广播欢迎新用户,除新用户外都可看到
                var query2 = "SELECT * from message WHERE (M_from = ? and M_From_Status = '1') or (M_to = ? and M_To_Status = '1');";
                var body2 = [data.nickname, data.nickname];
                sql(query2, body2, function(err, res) {
                    if (err) {
                        console.log("err is ", err);
                        return;
                    } else if (res) {
                        //console.log(res);
                        if (res.length === 0) {
                            return;
                        } else {
                            records = [];
                            var j = 0;
                            for (var i = res.length - 1; i >= 0; i--) {
                                records.push({
                                    text: res[i].M_Text,
                                    from: res[i].M_From,
                                    to: res[i].M_To,
                                    date: res[i].M_Date
                                });
                                j++;
                                if (j >= 200) {
                                    break;
                                }
                            }
                            socket.emit('messageAddedMany', records);
                        }
                    }
                });
            }
        });
    });

    socket.on('addMessage',function(data){ //有用户发送新消息
        try {
            if (data.from != socket.nickname) {
                // 篡改消息发送者
                return;
            }
            if(data.to){//发给特定用户
                // 发送者或者接收者为临时用户，直接发送
                if (onlineUsers[data.to]) {
                    var toUser = onlineUsers[data.to];
                    if (toUser.type === "tmpUser") {
                        if (connectedSockets[data.to]) {
                            connectedSockets[data.to].emit('messageAdded',data);
                        }
                        return;
                    }
                }
                if (onlineUsers[data.from]) {
                    var fromUser = onlineUsers[data.from];
                    if (fromUser.type === "tmpUser") {
                        if (connectedSockets[data.to]) {
                            connectedSockets[data.to].emit('messageAdded',data);
                        }
                        return;
                    }
                }
                // TODO 先查询data.to是否是已注册用户?
                var query = "INSERT INTO message SET ?;"
                body = {
                    M_From: data.from,
                    M_to: data.to,
                    M_Text: data.text,
                    M_Date: new Date().toISOString().slice(0, 19).replace('T', ' '),
                    M_Status: "offline",
                };
                if (connectedSockets[data.to]) {
                    body.M_Status = "sent";
                    //connectedSockets[data.to].emit('messageAdded',data);
                }
                sql(query, body, function(err, res) {
                    if (err) {
                        console.log("error is ", err);
                    } else if (res) {
                        if (connectedSockets[data.to]) {
                            connectedSockets[data.to].emit('messageAdded',data);
                        }
                    }
                });
            }else{//群发
                socket.broadcast.emit('messageAdded',data);//广播消息,除原发送者外都可看到
            }
        } catch (error) {
            console.log(Date().toString(), error);
        }
    });

    socket.on('deleteChat', function(data) {
        try {
            if (data.nickname != socket.nickname) {
                // 篡改消息发送者
                return;
            }
            var query = "SELECT * from message WHERE (M_from = ? and M_to = ?) or (M_from = ? and M_to = ?);";
            var body = [data.nickname, data.peer, data.peer, data.nickname];
            sql(query, body, function(err, res) {
                if (err) {
                    console.log("err is ", err);
                    return;
                } else if (res) {
                    if (res.length === 0) {
                        return;
                    } else {
                        var j = 0;
                        for (var i = res.length - 1; i >= 0; i--) {
                            if (res[i].M_From === data.nickname) {
                                if (res[i].M_To_Status === 0) {
                                    var query2 = "DELETE FROM message WHERE M_ID = ?";
                                    var body2 = [res[i].M_ID];
                                    sql(query2, body2, function(err, res) {
                                        if (err) {
                                            console.log("err is ", err);
                                            return;
                                        }
                                    });
                                    // delete DELETE FROM `users`.`message` WHERE (`M_ID` = '96');
                                } else {
                                    // Update UPDATE `users`.`message` SET `M_From_Status` = '0' WHERE (`M_ID` = '97');
                                    var query2 = "UPDATE message SET M_From_Status = '0' WHERE M_ID = ?";
                                    var body2 = [res[i].M_ID];
                                    sql(query2, body2, function(err, res) {
                                        if (err) {
                                            console.log("err is ", err);
                                            return;
                                        }
                                    });
                                }
                            } else if (res[i].M_To === data.nickname) {
                                if (res[i].M_From_Status === 0) {
                                    // delete
                                    var query2 = "DELETE FROM message WHERE M_ID = ?";
                                    var body2 = [res[i].M_ID];
                                    sql(query2, body2, function(err, res) {
                                        if (err) {
                                            console.log("err is ", err);
                                            return;
                                        }
                                    });
                                } else {
                                    // Update M_To_Status
                                    var query2 = "UPDATE message SET M_To_Status = '0' WHERE M_ID = ?";
                                    var body2 = [res[i].M_ID];
                                    sql(query2, body2, function(err, res) {
                                        if (err) {
                                            console.log("err is ", err);
                                            return;
                                        }
                                    });
                                }
                            }
                        }
                    }
                }
            });
        } catch (error) {
            console.log(error);
        }
    });

    socket.on('disconnect', function () {  //有用户退出聊天室
        try {
            socket.broadcast.emit('userRemoved', {  //广播有用户退出
                nickname: socket.nickname
            });
            if (onlineUsers[socket.nickname]) {
                delete onlineUsers[socket.nickname];
            }
            if (connectedSockets[socket.nickname]) {
                delete connectedSockets[socket.nickname]; //删除对应的socket实例
            }
        } catch (error) {
            console.log(error);
        }
    });

    /* bottle handlers */
    socket.on('bottlePost', function(data) {
        //console.log("bottlePost", data);
        bottles.push(data);
        if (bottles.length > 10000) {
            for (var i= 0; i < 100; i++) {
                bottles.shift();
            }
        }
    });

    socket.on('bottleGet', function(data) {
        //console.log("bottleGet", data);
        var msg;
        if (bottles.length) {
            var idx = Math.floor(Math.random() * bottles.length);
            msg = {from: bottles[idx].from, text: bottles[idx].text, date: bottles[idx].date};
        } else {
            msg = {from: '', text: '没有更多瓶子了'};
        }
        socket.emit('bottleGet', msg);
    });
});

http.listen(3002, function () {
    console.log('listening on *:3002');
});
