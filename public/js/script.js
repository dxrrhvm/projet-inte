document.addEventListener('DOMContentLoaded', () => {
    // --- 1. TON CODE EXISTANT (Accordéons) ---
    const accordions = document.querySelectorAll('.accordion-header');

    accordions.forEach(acc => {
        acc.addEventListener('click', () => {
            acc.classList.toggle('active');
            const panel = acc.nextElementSibling;
            
            if (panel.style.maxHeight) {
                panel.style.maxHeight = null;
            } else {
                panel.style.maxHeight = panel.scrollHeight + "px";
            }
        });
    });

   // --- 2. CODE MODALE ---
    const modal = document.getElementById('tosModal');
    const closeBtn = document.getElementById('closeModal');
    const ageCheck = document.getElementById('ageCheck');
    const tosCheck = document.getElementById('tosCheck');
    const confirmBtn = document.getElementById('confirmBtn');
    
    // On cible tes vrais boutons avec la classe .chat-btn
    const chatButtons = document.querySelectorAll('.chat-btn'); 
    let chatTypeSelection = ''; 

    // Afficher la modale quand on clique sur Texte ou Vidéo
    chatButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault(); // Empêche le lien de s'ouvrir tout de suite
            chatTypeSelection = btn.dataset.type; // Enregistre si c'est 'text' ou 'video'
            modal.style.display = 'flex'; // Affiche la modale
        });
    });

    // Fermer la modale (avec le bouton X)
    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    // Fonction pour vérifier si les deux cases sont cochées
    function validateCheckboxes() {
        if (ageCheck.checked && tosCheck.checked) {
            confirmBtn.disabled = false;
            confirmBtn.classList.add('active');
        } else {
            confirmBtn.disabled = true;
            confirmBtn.classList.remove('active');
        }
    }

    // Écouter les changements sur les cases à cocher
    ageCheck.addEventListener('change', validateCheckboxes);
    tosCheck.addEventListener('change', validateCheckboxes);

    // Action lors du clic sur le bouton "Confirm & continue"
    confirmBtn.addEventListener('click', () => {
        if (!confirmBtn.disabled) {
            modal.style.display = 'none';
            
            // Redirection selon le bouton cliqué au départ
            if (chatTypeSelection === 'video') {
                window.location.href = '/chat'; // Ouvre la page de chat vidéo
            } else if (chatTypeSelection === 'text') {
                alert('Text chat coming soon!'); // Ton alerte pour le moment
            }
        }
    });
});