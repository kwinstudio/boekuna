function toggleMenu(){document.getElementById('mobileMenu')?.classList.toggle('open')}
document.addEventListener('click',e=>{const m=document.getElementById('mobileMenu');if(m&&m.classList.contains('open')&&!e.target.closest('.mobile-menu')&&!e.target.closest('.mobile-toggle'))m.classList.remove('open')});
