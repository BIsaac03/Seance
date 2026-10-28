import questions from "./static/questions.json" with { type: "json" }

import express from "express";
import { faker } from "@faker-js/faker"
import { GoogleGenAI } from '@google/genai';
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/////// SOCKETIO SETUP
const app = express();
const httpServer = createServer(app);
const port = process.env.PORT || 3000 ;

app.use(express.static(__dirname));

app.use("/static", express.static(join(__dirname, 'static')));

app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'index.html'));
});

const io = new Server(httpServer, {
    cors: {
        origin: "http://localhost:5500",
    }
});

io.use((socket, next) => {
    socket.currentID = socket.handshake.auth.token;
    next();
});

const ai = new GoogleGenAI({});

class Lobby {
    #roomCode
    #allPlayers = [];

    constructor(roomCode){
        this.#roomCode = roomCode;
    }
    addPlayer(newPlayer){
        this.#allPlayers.push(newPlayer);
    }
    removePlayer(removePlayer){
        const index = this.#allPlayers.indexOf(removePlayer);
        this.#allPlayers.splice(index, 1);
    }

    set roomCode(newCode){
        this.#roomCode = newCode;
    }

    get roomCode(){
        return this.#roomCode;
    }
    get allPlayers(){
        return this.#allPlayers;
    }
}
class GameState {
    #spiritID;
    #players = [];
    #gameRound = 0;
    #gamePhase = "Word Generation";
    #wordList = [];
    #secretWord;
    #revealedLetters = [];
    #questionBank = new Set([]);
    #currentQuestion;
    #userAnswers;
    #spiritChoice;

    constructor(numQuestions, spiritID, players) {
        while (this.#questionBank.size < numQuestions) {
            const randIndex = Math.floor(Math.random() * questions.length);
            this.#questionBank.add(questions[randIndex]);
        }
        this.#spiritID = spiritID;
        this.#players = players;
    }

    addToWordList(word){
        this.#wordList.push(word);
    }
    revealWordLength(){
        for (let i = 0; i < this.#secretWord[0].length; i++){
            this.#revealedLetters.push(undefined);
        }
    }
    revealNewLetter(){
        const lettersLeft = this.#revealedLetters.filter(letter => letter == undefined).length;
        const indexToReveal = Math.floor(Math.random() * lettersLeft);
        this.#revealedLetters[indexToReveal] = this.#secretWord[0][indexToReveal];
    }
    newRound(){
        this.#gameRound++;
        this.#currentQuestion = undefined;
        this.#userAnswers = undefined;
        this.#spiritChoice = undefined;
    }


    set spiritID(newID){
        this.#spiritID = newID;
    }
    set players(allPlayers){
        this.#players = allPlayers;
    }
    set secretWord(wordToGuess){
        this.#secretWord = wordToGuess;
    }
    set gameRound(newRound){
        this.#gameRound = newRound;
    }
    set gamePhase(newPhase){
        this.#gamePhase = newPhase;
    }
    set currentQuestion(question){
        this.#currentQuestion = question;
    }

    get spiritID(){
        return this.#spiritID;
    }
    get players(){
        return this.#players;
    }
    get questionBank(){
        return [...this.#questionBank];
    }
    get gameRound(){
        return this.#gameRound;
    }
    get wordList(){
        return this.#wordList;
    }
    get revealedLetters(){
        return this.#revealedLetters;
    }
    get secretWord() {
        return this.#secretWord;
    }
    get gamePhase(){
        return this.#gamePhase
    }
}
class Player {
    #playerName;
    #playerID;
    #numPts = 0;
    #currentGuess;
    #isReady;

    constructor (playerName, playerID) {
        this.#playerName = playerName;
        this.#playerID = playerID;
    }
    modifyPts(change){
        this.#numPts += change;
    }

    set currentGuess(newGuess){
        this.#currentGuess = newGuess;
    }
    set isReady(newReadiness){
        this.#isReady = newReadiness;
    }

    get playerName(){
        return this.#playerName
    }
    get playerID(){
        return this.#playerID;
    }
    get numPts(){
        return this.#numPts;
    }
    get currentGuess(){
        return this.#currentGuess;
    }
    get isReady(){
        return this.#isReady;
    }
}

const openLobbies = []
const ongoingGames = [];


/////////// SERVER EVENTS
io.on("connection", (socket) => { 
    const inGame = ongoingGames.find(game => game.players.find(player => player.playerID == socket.currentID))
    if (inGame){
        const me = inGame.players.find(player => player.playerID == socket.currentID);
        socket.emit("reconnection", inGame.spiritID, inGame.gamePhase, inGame.gameRound, inGame.currentQuestion, inGame.revealedLetters, me.isReady);
        
        if (socket.currentID == inGame.spiritID){
            switch(inGame.gamePhase){
                case "Word Selection":
                    socket.emit("chooseWord", inGame.wordList);
                    break;
                
                case "Question Selection":
                    chooseQuestion(socket, inGame);
                    break;

                case "Question Evaluation":
                    socket.emit("evaluateQuestion", socket.currentID, inGame.players);
                    break;

                case "A/B Evaluation":
                    break;
            }
        }
    }
    else{
        const myLobby = openLobbies.find(lobby => lobby.allPlayers.find(player => player.playerID == socket.currentID));
        if (myLobby){
            const playersArray = myLobby.allPlayers.map(player => [player.playerName, player.playerID]);
            socket.emit("populateLobby", myLobby.roomCode, playersArray);
        }
        else{
            socket.emit("promptRoomCode");
        }
    }

    socket.on("joinedLobby", (roomCode, myID) => {
        let existingLobby = openLobbies.find(lobby => lobby.roomCode == roomCode);
        if (!existingLobby){
            existingLobby = new Lobby(roomCode);
            openLobbies.push(existingLobby);
        }
        // !! randomly generate starting names
        const me = new Player("Test", myID);
        existingLobby.addPlayer(me);
        const playersArray = existingLobby.allPlayers.map(player => [player.playerName, player.playerID]);
        socket.emit("populateLobby", roomCode, playersArray);
        socket.broadcast.emit("newPlayerInLobby", [me.playerName, myID]);
    })

    socket.on("startGame", (roomCode, myID) => {
        io.emit("clearLobbyElements");

        const myLobby = openLobbies.find(lobby => lobby.roomCode == roomCode);

        const myGame = new GameState(6, myID, myLobby.allPlayers);


        const lobbyIndex = openLobbies.indexOf(myLobby);
        openLobbies.splice(lobbyIndex, 1);

        ongoingGames.push(myGame);
        myGame.gamePhase = "Waiting on Generation";
        generateRandomWords(socket, 4, myID);
    })

    socket.on("chosenWord", (wordToGuess, spiritID) => {
        const myGame = ongoingGames.find(game => game.spiritID == spiritID);
        myGame.secretWord = wordToGuess;
        myGame.gamePhase = "Question Generation";
        chooseQuestion(socket, myGame);
    })

    socket.on("chosenQuestion", (questionText, spiritID) => {
        const myGame = ongoingGames.find(game => game.spiritID == spiritID);
        myGame.currentQuestion = questionText;
        myGame.gamePhase = "Question Responses";
        myGame.players.forEach(player => {
            player.isReady = false;
        });
        socket.broadcast.emit("questionToAnswer", (questionText));
    })

    socket.on("guessEntered", (playerID, playerGuess) => {
        const myGame = ongoingGames.find(game => game.players.find(player => player.playerID == playerID));
        const me = myGame.players.find(player => player.playerID == playerID);
        me.currentGuess = playerGuess;
        me.isReady = true;
        checkReadiness(myGame);
    })


    socket.on("evaluatedQuestionAnswers", (winner) => {
        // !! reveal and save chosen answer 
    })
    socket.on("evaluatedCloserWord", (ranking) => {
        // !! reveal and save chosen ranking
    })
})
httpServer.listen(port, function () {
    var host = httpServer.address().address
    var port = httpServer.address().port
    console.log('App listening at https://%s:%s', host, port)
});

function chooseQuestion(socket, myGame){
    console.log("choosing question");
    // !! modify questionRound based on number of players (-1 for spirit)
    const questionRound = myGame.gameRound - 8*(eval(myGame.gameRound > 2));
    const q1 = myGame.questionBank[2*questionRound];
    const q2 = myGame.questionBank[2*questionRound + 1];


    myGame.gamePhase = "Question Selection";
    socket.emit("chooseQuestion", myGame.spiritID, q1, q2);
}

async function generateRandomWords(socket, numWordsToGenerate, spiritID){
    const myGame = ongoingGames.find(game => game.spiritID == spiritID);
    const res = await fetch("https://randomapi.dev/api/words?type=noun&count=50");
    const { data, meta } = await res.json();

    const modelResponse = await ai.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents:  `Examine these nouns: ${JSON.stringify(data)}. For each, evaluate how difficult it would be to guess using yes/no questions. Rate physical objects as easier than ideas, gerunds, and the like. 
                    Uncommon words are difficult to guess. Respond only with a string  of 50 digits, each corresponding value from 1(easiest) - 9(hardest). Pay special attention to values you assign to words in the 1-5 range.
                    Use the following examples as a rough guidline 1: car, arm, house; 2: finger, bottle, tissue; 3: coaster, driveway, whisker; 4: antennae, cord, alarm; 5: diorite, flow, occupation;`,
    });

    let numValidCandidates = 0;
    for (let i = 0; i < 50; i++){
        const difficulty = modelResponse.text[i];
        const generatedWord = data[i].word;
        if(difficulty <= 5){
            myGame.addToWordList([generatedWord, difficulty]);
            numValidCandidates++;
        }
        console.log(`'${generatedWord}' rated as a '${difficulty}'`);

        if(numValidCandidates == numWordsToGenerate){
            break;
        }
    }
    myGame.gamePhase = "Word Selection";
    socket.emit("chooseWord", myGame.wordList);
}

function checkReadiness(myGame){
    const waitingOnPlayer = myGame.players.find(player => !player.isReady);
    if (!waitingOnPlayer){
        switch(myGame.gamePhase){
            case "Question Response":
                myGame.gamePhase = "Question Evaluation";
                io.emit("evaluateQuestion", myGame.spiritID, myGame.players);
                break;
            case "A/B Response":
                myGame.gamePhase = "A/B Evaluation";
                // !! split into pairs and set to spirit
                break;
        }
    }
}