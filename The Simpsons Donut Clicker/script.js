var gameContainer = document.getElementById('game-container');
var gameBg = document.getElementById('game-bg');
var donut = document.getElementById('donut');
var score = document.getElementById('score');
var homer = document.getElementById('homer');
var logoDonut = document.getElementById('logo-donut');
var theme = document.getElementById('theme');
var eat = document.getElementById('eat');
var poke = document.getElementById('poke');
var intro = document.getElementById('intro');
var welcomeScreen = document.getElementById('welcome-screen');
var startGame = document.getElementById('startButton');
var introText = document.getElementById('intro-text');

donut.addEventListener('click', function() {
  eat.currentTime = 0; 
  eat.play();
  score.textContent = 'Donuts Eaten: ' + (parseInt(score.textContent.split(': ')[1]) + 1);
  homer.style.width = (parseInt(homer.style.width) + 5) + 'px';
});

logoDonut.addEventListener('click', function() {
  eat.currentTime = 0; 
  eat.play();
});

startGame.addEventListener('click', function() {
  intro.play();
  intro.addEventListener('ended', function() {
    theme.play();
  });
  gameBg.style.opacity = '1';
  welcomeScreen.style.display = 'none';
  gameBg.style.filter = 'none';
  gameBg.style.transform = 'scale(1.2)';
  gameBg.style.backgroundImage = "url('assets/background.jpg')";
  gameContainer.style.display = 'flex';
  gameBg.style.transform = 'scale(1)';
  
});

homer.addEventListener('click', function() {
  poke.currentTime = 0; 
  poke.play();
});