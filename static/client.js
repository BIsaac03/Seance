if (document.cookie == ""){
    document.cookie = "userID=p"+crypto.randomUUID();
}
const myID = document.cookie.slice(7);
let myPlayerNum = undefined;

const socket = io("http://localhost:3000", {
    auth: {
        token: myID
    }
});

const bodyElement = document.body;

socket.on("promptRoomCode", () => {
    addFlamingCandle(document.getElementById("candle"));

    const promptDiv = document.createElement("div");
    promptDiv.id = "promptRoomCode";
    const instructionText = document.createElement("p");
    instructionText.textContent = "Enter an existing room code, or leave blank to create a new room.";
    const roomCodeEntry = document.createElement("input");
    roomCodeEntry.placeholder = "CODE";
    roomCodeEntry.maxLength = "4";

    roomCodeEntry.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            let roomCode = roomCodeEntry.value;
            if (roomCode == ""){
                roomCode = (Math.random().toString(36).slice(2, 6)).toUpperCase();
                socket.emit("joinedLobby", roomCode, myID);
                promptDiv.remove();
            }
            else if (roomCode.length == 4){
                socket.emit("joinedLobby", roomCode, myID);
                promptDiv.remove();
            }
            else{
                // !! alert user than code must be 4 characters
            } 
        }
    });
    promptDiv.append(instructionText, roomCodeEntry);
    bodyElement.appendChild(promptDiv);

    roomCodeEntry.focus();
})

socket.on("populateLobby", (roomCode, players) => {
    addFlamingCandle(document.getElementById("candle"));

    const roomCodeText = document.createElement("p");
    roomCodeText.textContent = roomCode;
    roomCodeText.classList.add("roomCode");
    const playerLobby = document.createElement("div");
    playerLobby.id = "playerLobby";

    const startGameButton = document.createElement("button");
    startGameButton.id = "startGame";
    startGameButton.textContent = "Assume a ghostly form (START GAME)";
    startGameButton.addEventListener("click", () => {
        startGameButton.remove();
        socket.emit("startGame", roomCode, myID);

        const waitingMessage = document.createElement("p");
        waitingMessage.textContent = "Generating Words..."
        waitingMessage.classList.add("waitingMessage");
        bodyElement.appendChild(waitingMessage);
    })
    bodyElement.append(roomCodeText, playerLobby, startGameButton);

    players.forEach(player => {addPlayerToLobby(player)})
})

socket.on("newPlayerInLobby", (newPlayer) => {
    addPlayerToLobby(newPlayer);
})

socket.on("clearLobbyElements", () => {
    removeExistingElement(".roomCode");
    removeExistingElement("#playerLobby");
    removeExistingElement("#startGame");
})


socket.on("reconnection", (spiritID, gamePhase, gameRound, currentQuestion, revealedLetters, isReady) => {
    addFlamingCandle(document.getElementById("candle"));
    
    console.log(`spiritID: ${spiritID}, myID: ${myID}`);
    if (myID != spiritID){
        if (!isReady){
            switch(gamePhase){
                case "Question Response":
                    displayQuestion(currentQuestion);
                    allowGuessEntry(socket);
                    break;
                
                case "A/B Response":
                    displayQuestion("Write the closer word in a head-to-head");
                    allowGuessEntry(socket);
                    break;
            }
        }
    }
})

socket.on("chooseWord", (wordList) => {
    removeExistingElement("#chooseWord");
    removeExistingElement(".waitingMessage");
    const wordChoicePopUp = document.createElement("div");
    wordChoicePopUp.id = "chooseWord";

    wordList.forEach(wordDifficultyPair => {
        const optionDiv = document.createElement("div");

        const button = document.createElement("button");
        button.textContent = wordDifficultyPair[0];

        button.addEventListener("click", () => {
            wordChoicePopUp.remove();
            socket.emit("chosenWord", wordDifficultyPair, myID);
        })

        const difficulty = document.createElement("p");
        difficulty.textContent = wordDifficultyPair[1];

        optionDiv.append(button, difficulty);
        wordChoicePopUp.appendChild(optionDiv);
    });

    bodyElement.appendChild(wordChoicePopUp);
})

socket.on("chooseQuestion", (spiritID, q1, q2) => {
    if (myID == spiritID){
        chooseQuestion(q1, q2)  
    }
})

socket.on("questionToAnswer", (questionText) => {
    displayQuestion(questionText);
    allowGuessEntry(socket);
})

socket.on("evaluateQuestion", (spiritID, players) => {
    if (myID == spiritID){
        // !! evaluate question
    }
})

socket.on("evaluateA/B", (spiritID, A, B) => {
    if (myID == spiritID){
        // !! evaluate A/B
    }
})

socket.on("displayRevealedLetters", (revealedLetters) => {
    beginWordReveal(revealedLetters.length);
    revealAllLetters(revealedLetters);
})

function addPlayerToLobby([name, ID]){
    const playerDiv = document.createElement("div");
    playerDiv.classList.add("player");
    const playerName = document.createElement("p");
    playerName.textContent = name;
    playerDiv.appendChild(playerName);

    document.getElementById("playerLobby").appendChild(playerDiv);
}

function beginWordReveal(wordLength){
    removeExistingElement("#secretWord");
    const secretWord = document.createElement("div");
    secretWord.id = "secretWord";
    for (let i = 0; i < wordLength; i++){
        const letterDiv = document.createElement("div");
        letterDiv.classList.add(`letter${i}`);
        const letter = document.createElement("p");
        letter.textContent = "_";

        letterDiv.appendChild(letter);
        secretWord.appendChild(letterDiv);
    }
    secretWord.style.gridTemplateColumns = `repeat(${wordLength}, 1fr)`;
    bodyElement.appendChild(secretWord);
}

function chooseQuestion(q1Text, q2Text){
    const questionChoicePopUp = document.createElement("div");
    questionChoicePopUp.id = "chooseQuestion";

    const q1 = document.createElement("button");
    q1.innerHTML = q1Text;
    const or = document.createElement("p");
    or.textContent = "or";
    const q2 = document.createElement("button");
    q2.innerHTML = q2Text;

    q1.addEventListener("click", () => {
        questionChoicePopUp.remove();
        socket.emit("chosenQuestion", q1Text, myID);
    })
    q2.addEventListener("click", () =>{
        questionChoicePopUp.remove();
        socket.emit("chosenQuestion", q2Text, myID);
    })

    questionChoicePopUp.append(q1, or, q2);
    bodyElement.appendChild(questionChoicePopUp);   
}

function displayQuestion(questionText){
    const questionDisplay = document.createElement("div");
    questionDisplay.id = "questionDisplay";
    const question = document.createElement("p");
    question.innerHTML = questionText;
    questionDisplay.appendChild(question);
    bodyElement.appendChild(questionDisplay);
}

function allowGuessEntry(socket){
    const userGuess = document.createElement("div");
    userGuess.id = "userGuess";
    userGuess.classList.add("answer");
    const guessEntry = document.createElement("input");
    guessEntry.value = "";
    userGuess.appendChild(guessEntry);
    bodyElement.appendChild(userGuess);
    guessEntry.focus();

    guessEntry.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && guessEntry.value != "") {
            userGuess.remove();
            socket.emit("guessEntered", myID, guessEntry.value());
        }
    });
}

function displayQuestionAnswers(){

}

function displayABChoices(a, b){
    const ABResults = document.createElement("div");
    ABResults.id = "ABResults"

    const answerA = document.createElement("div");
    answerA.classList.add("answer");
    const AText = document.createElement("p");
    AText.textContent = a;
    answerA.appendChild(AText);

    const answerB = document.createElement("div");
    answerB.classList.add("answer");
    const BText = document.createElement("p");
    BText.textContent = b;
    answerB.appendChild(BText);

    ABResults.append(answerA, answerB);
    bodyElement.appendChild(ABResults);
}

function revealLetter(index, value){
    const letterToReveal = document.querySelector(`#secretWord .letter${index} p`);
    letterToReveal.textContent = value;
}
function revealAllLetters(revealedLetters){
    for (let i = 0; i < revealedLetters.length; i++){
        if (revealedLetters[i]){
            revealLetter(i, revealedLetters[i]);
        }
    }
}

function removeExistingElement(querySelector){
    const elementToRemove = document.querySelector(querySelector);
    if (elementToRemove){
        elementToRemove.remove();
    }
}

async function svgToText(url) {
    const response = await fetch(url);
    const svgText = await response.text();
    return svgText;
}
async function addFlamingCandle(){
    const candleDiv = document.getElementById("candle");
    candleDiv.innerHTML = "";

    const candleText = await svgToText("/static/Images/Candle.svg");
    const flameText = await svgToText("/static/Images/Flame.svg");

    const parser = new DOMParser();
    const candleDoc = parser.parseFromString(candleText, "image/svg+xml");
    const flameDoc = parser.parseFromString(flameText, "image/svg+xml");
    
    const candleSvg = candleDoc.querySelector("svg");
    candleSvg.classList.add("candle");
    const flameSvg = flameDoc.querySelector("svg");
    flameSvg.classList.add("flame");

    candleDiv.append(flameSvg, candleSvg);
}
async function animateFlame(newFlame) {
    const newFlameText = await svgToText(`/static/Images/${newFlame}.svg`);

    const parser = new DOMParser();
    const newFlameDoc = parser.parseFromString(newFlameText, "image/svg+xml");
    const newFlameSvg = newFlameDoc.querySelector("svg");

    const startPaths = document.querySelectorAll("#candle .flame path");
    const targetPaths = newFlameSvg.querySelectorAll("path");

    startPaths.forEach((path, index) => {
        const target = targetPaths[index]; 
        if (target) {
            gsap.to(path, {duration: 2.5, morphSVG: target});
        }
    });
}