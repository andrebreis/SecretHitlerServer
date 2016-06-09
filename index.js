var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server);

var LIBERAL = 0;
var FASCIST = 1;
var HITLER = 2;
var FASCIST_WIN = 6;
var HITLER_WIN = 7;
var LIBERAL_WIN = 8;

var playerIndex = 0;
var players = [];
var noActivePlayers;

var presidentIndex = 0;
var chancellorIndex = -1;
var chancellorCandidateIndex = -1;
var lastPresident = -1;
var lastChancellor = -1;
var noFascistLaws = 0;
var noLiberalLaws = 0;
var policyDeck = [];

var topPolicies = [];

var chancellorVotes = {};

var gameStarted = false;
var gameEnded = false;

port = (process.env.PORT || 8080);

server.listen(port, function(){
  //console.log("Server is now running...");
  console.log('Node app is running on port', port);
});


// COMUNICATION



io.on('connection', function(socket){
  if(gameStarted || playerIndex == 9)
    socket.disconnect('unauthorized');
  else if (!gameEnded){
  //console.log("Player Connected!");
  socket.emit('getPlayers', players);
  players.push(new player(socket.id, playerIndex++));
  socket.emit('idAndPosition', { id : socket.id, position : playerIndex - 1});
  socket.on('disconnect', function(){
  //  console.log("Player Disconnected!");
    for(var i = 0; i < players.length; i++){
      if(players[i].id == socket.id){
        socket.broadcast.emit('playerDisconnected', { position : players[i].position});
        if(gameStarted){
          players[i].playing = false;
          noActivePlayers--;
          if(noActivePlayers == 0){
            playerIndex = 0;
            players = [];
            noActivePlayers=0;

            presidentIndex = 0;
            chancellorIndex = -1;
            chancellorCandidateIndex = -1;
            lastPresident = -1;
            lastChancellor = -1;
            noFascistLaws = 0;
            noLiberalLaws = 0;
            policyDeck = [];

            topPolicies = [];

            chancellorVotes = {};

            gameStarted = false;
            gameEnded = false;
          }
        }
        else {
          players.splice(i, 1);
          playerIndex--;
          fixPlayerPositions();
        }
      }
    }
    //console.log(players);
  });
  socket.on('playerName', function(name){
    for(var i = 0; i < players.length; i++){
      if(players[i].id == socket.id){
        players[i].name = name;
        socket.broadcast.emit('newPlayer', { id : socket.id, name : players[i].name, position: players[i].position});
        //console.log(players);
      }
    }
  });
  socket.on('gameStarted', function(){
    //console.log("Game Started " + socket.id);
    gameStarted = true;
    assignRoles();
    shuffleDeck();
    socket.emit('setPlayers', { players : players });
    socket.broadcast.emit('setPlayers', { players : players });
    noActivePlayers = players.length;
  });
  socket.on('pickedChancellor', function(index){
    //console.log("Picked chancellor");
    if(gameEnded)
      return;
    chancellorCandidateIndex = index;
    //console.log("chancellor candidate " + index);
    socket.emit('initiateChancellorVote', { position : index });
    socket.broadcast.emit('initiateChancellorVote', { position : index });
  //  console.log("emitted all");
  });
  socket.on('voteForChancellor', function(vote){
    //console.log("" + socket. id + "voted!");
    if(gameEnded)
      return;
    chancellorVotes[socket.id] = vote;
    //console.log(chancellorVotes);
    //console.log(Object.keys(chancellorVotes).length + " !=" + noActivePlayers);
    if(Object.keys(chancellorVotes).length == noActivePlayers){
      //console.log("All players voted");
      var voteSum = 0;
      for(var key in chancellorVotes){
        voteSum += chancellorVotes[key];
      }
      //console.log("" + voteSum + " yes's");
      socket.emit('chancellorVoteResult', {votes : chancellorVotes, verdict : voteSum > Object.keys(chancellorVotes).length/2}); //TODO: socket.on for this on java
      socket.broadcast.emit('chancellorVoteResult', {votes : chancellorVotes, verdict : voteSum > Object.keys(chancellorVotes).length/2});
      if(voteSum > Object.keys(chancellorVotes).length/2){
        chancellorIndex = chancellorCandidateIndex;
        if(noFascistLaws >= 3 && players[chancellorIndex].role == HITLER){
          console.log("hitler won")
          gameEnded = true;
          socket.emit('endGame', { victor : HITLER_WIN});
          socket.broadcast.emit('endGame', { victor : HITLER_WIN});
          return;
        }
        topPolicies = [];
        if(policyDeck.length < 3){
          shuffleDeck();
        }
        chancellorVotes = {};
        //console.log("before: " + policyDeck);
        topPolicies.push(policyDeck.pop());
        topPolicies.push(policyDeck.pop());
        topPolicies.push(policyDeck.pop());
        //console.log("after: " + policyDeck);
        socket.emit('getPresidentOptions', topPolicies);
        socket.broadcast.emit('getPresidentOptions', topPolicies);
      }
    }
  });
  socket.on('removeLaw', function(index){
    if(gameEnded)
      return;
    topPolicies.splice(index, 1);
    socket.emit("getChancellorOptions", topPolicies);
    socket.broadcast.emit("getChancellorOptions", topPolicies);
  });
  socket.on('pickLaw', function(index){
    if(gameEnded)
      return;
    if(topPolicies[index] == FASCIST){
      noFascistLaws++;
    }
    else{
      noLiberalLaws++;
    }
    if(noFascistLaws == 6){
      gameEnded = true;
      socket.emit('endGame', { victor : FASCIST_WIN});
      socket.broadcast.emit('endGame', { victor : FASCIST_WIN});
      return;
    }
    if(noLiberalLaws == 5){
      gameEnded = true;
      socket.emit('endGame', { victor : LIBERAL_WIN});
      socket.broadcast.emit('endGame', { victor : LIBERAL_WIN});
      return;
    }
    lastPresident = presidentIndex;
    do{
      console.log(presidentIndex + ": " + players[presidentIndex].playing)
      presidentIndex = (presidentIndex + 1) % players.length;
    }while(!players[presidentIndex].playing)
    console.log("newPresident : "+ presidentIndex);
    socket.emit("setPresident", {index : presidentIndex, law : topPolicies[index]});
    socket.broadcast.emit("setPresident", {index: presidentIndex, law : topPolicies[index]});
  });
}
});








//GAMELOGIC





function player(id, position){
  this.id = id;
  this.position = position;
  this.playing = true;
  this.name = "";
  this.party = -1;
  this.role = -1;
}

function shuffleDeck(){

  var numLiberalCards = 6;
  var numFascistCards = 11;
  var noRandomNumbers = 1000;

  while(numFascistCards + numLiberalCards > 0){
    var card = Math.floor(Math.random() * noRandomNumbers);
    if(card < noRandomNumbers/2 && numFascistCards > 0){
      numFascistCards--;
      policyDeck.push(FASCIST);
    }
    else if(numLiberalCards > 0) {
      numLiberalCards--;
      policyDeck.push(LIBERAL);
    }
  }
}

function assignRoles(){
  var noLiberals;
  var noFascists;

  if(players.length == 5 || players.length == 6){
    noFascists = 2;
  }
  else if(players.length == 7 || players.length == 8){
    noFascists = 3;
  }
  else{ //(players.size() == 9 || players.size() == 10)
    noFascists = 4;
  }

  noLiberals = players.length - noFascists;

  var hitlerIndex = Math.floor(Math.random() * players.length);
  players[hitlerIndex].role = HITLER;
  players[hitlerIndex].party = FASCIST;
  noFascists--;

  while(noFascists > 0){
    var fascistIndex = Math.floor(Math.random() * players.length);
    if(players[fascistIndex].role == -1){
      players[fascistIndex].role = FASCIST;
      noFascists--;
    }
  }

  while(noLiberals > 0){
    var liberalIndex = Math.floor(Math.random() * players.length);
    if(players[liberalIndex].role == -1){
      players[liberalIndex].role = LIBERAL;
      noLiberals--;
    }
  }
}

function fixPlayerPositions(){
  for(var i = 0; i < players.length ; i++){
    players[i].position = i;
  }
}
