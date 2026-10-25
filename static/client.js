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

socket.on("chooseWord", (wordList) => {
    // !! A/B result testing
    const ABResults = document.createElement("div");
    ABResults.id = "ABResults"

    const choices = document.createElement("div");
    choices.classList.add("choices");

    const answerA = document.createElement("div");
    answerA.classList.add("answer");
    const AText = document.createElement("p");
    AText.textContent = "Onion";
    answerA.appendChild(AText);

    const answerB = document.createElement("div");
    answerB.classList.add("answer");
    const BText = document.createElement("p");
    BText.textContent = "Avalanche";
    answerB.appendChild(BText);

    choices.append(answerA, answerB);
    ABResults.appendChild(choices);
    bodyElement.appendChild(ABResults);


    /// !! candle testing
    addFlamingCandle(ABResults);
    setTimeout(() => {
        animateFlame("Flame2");
    }, 100);
    setTimeout(() => {
        animateFlame("Flame1");
    }, 1100);

    removeExistingElement("#chooseWord");
    const wordChoicePopUp = document.createElement("div");
    wordChoicePopUp.id = "chooseWord";

    wordList.forEach(wordDifficultyPair => {
        const optionDiv = document.createElement("div");

        const button = document.createElement("button");
        button.textContent = wordDifficultyPair[0];

        button.addEventListener("click", () => {
            wordChoicePopUp.remove();
            socket.emit("chosenWord", wordDifficultyPair);
        })

        const difficulty = document.createElement("p");
        difficulty.textContent = wordDifficultyPair[1];

        optionDiv.append(button, difficulty);
        wordChoicePopUp.appendChild(optionDiv);
    });

    bodyElement.appendChild(wordChoicePopUp);
})

socket.on("chooseQuestion", (q1Text, q2Text) => {
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
        socket.emit("chosenQuestion", q1Text);
    })
    q2.addEventListener("click", () =>{
        questionChoicePopUp.remove();
        socket.emit("chosenQuestion", q2Text);
    })

    questionChoicePopUp.append(q1, or, q2);
    bodyElement.appendChild(questionChoicePopUp);
})

socket.on("questionToAnswer", (questionText) => {
    const questionDisplay = document.createElement("div");
    questionDisplay.id = "questionDisplay";
    const question = document.createElement("p");
    question.innerHTML = questionText;
    questionDisplay.appendChild(question);
    bodyElement.appendChild(questionDisplay)
})

socket.on("displayRevealedLetters", (revealedLetters) => {
    beginWordReveal(revealedLetters.length);
    revealAllLetters(revealedLetters);
})

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
async function addFlamingCandle(divToAddTo){
    const candleText = await svgToText("/static/Images/Candle.svg");
    const flameText = await svgToText("/static/Images/Flame.svg");

    const parser = new DOMParser();
    const candleDoc = parser.parseFromString(candleText, "image/svg+xml");
    const flameDoc = parser.parseFromString(flameText, "image/svg+xml");
    
    const candleSvg = candleDoc.querySelector("svg");
    candleSvg.classList.add("candle");
    const flameSvg = flameDoc.querySelector("svg");
    flameSvg.classList.add("flame");

    const candleDiv = document.createElement("div");
    candleDiv.id = "candle";
    candleDiv.append(flameSvg, candleSvg);
    divToAddTo.appendChild(candleDiv);
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