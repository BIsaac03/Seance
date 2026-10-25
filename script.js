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
    currentID = socket.handshake.auth.token;
    next();
});

let currentID = undefined;
const ai = new GoogleGenAI({});

class GameState {
    #gameID;
    #gameRound = 0;
    #gamePhase = "Word Generation";
    #wordList = [];
    #secretWord;
    #revealedLetters = [];
    #questionBank = new Set([]);
    #currentQuestion;
    #userAnswers;
    #spiritChoice;

    constructor(numQuestions, gameID) {
        while (this.#questionBank.size < numQuestions) {
            const randIndex = Math.floor(Math.random() * questions.length);
            this.#questionBank.add(questions[randIndex]);
        }
        this.#gameID = gameID;
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

    get questionBank(){
        return [...this.#questionBank];
    }
    get gameRound(){
        return this.#gameRound
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

const myGame = new GameState(6, crypto.randomUUID());

let generatedWords = false
let generatingWords = false;

/////////// SERVER EVENTS
io.on("connection", (socket) => {   
    if (myGame.wordList.length == 4){
        socket.emit("chooseWord", myGame.wordList);
    }
    else if (myGame.gamePhase == "Word Generation"){
        myGame.gamePhase = "Waiting on Generation";
        generateRandomWords(socket, 4);
    }

    socket.on("chosenWord", (wordToGuess) => {
        myGame.secretWord = wordToGuess;
        myGame.gamePhase = "Question Generation";
        chooseQuestion(socket, 0);
    })

    socket.on("chosenQuestion", (questionText) => {
        myGame.currentQuestion = questionText;
        myGame.gamePhase = "Question Responses";

        // !! make socket.broadcast.emit for multiplayer functionality
        socket.emit("questionToAnswer", (questionText));
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

function chooseQuestion(socket, questionRound){
    if (myGame.gamePhase == "Question Generation"){
        const q1 = myGame.questionBank[2*questionRound];
        const q2 = myGame.questionBank[2*questionRound + 1];

        myGame.gamePhase = "Question Selection";
        socket.emit("chooseQuestion", q1, q2);
    }
}

async function generateRandomWords(socket, numWordsToGenerate){
    const res = await fetch("https://randomapi.dev/api/words?type=noun&count=50");
    const { data, meta } = await res.json();

    const modelResponse = await ai.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents:  `Examine these nouns: ${JSON.stringify(data)}. For each, evaluate how difficult it would be to guess using the following questions: ${questions}. Rate physical objects as easier than ideas, gerunds, and the like. 
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