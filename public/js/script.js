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

    const modal = document.getElementById('tosModal');
    const closeBtn = document.getElementById('closeModal');
    const ageCheck = document.getElementById('ageCheck');
    const tosCheck = document.getElementById('tosCheck');
    const confirmBtn = document.getElementById('confirmBtn');
    
    const chatButtons = document.querySelectorAll('.chat-btn'); 
    let chatTypeSelection = ''; 

    chatButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault(); 
            chatTypeSelection = btn.dataset.type; 
            modal.style.display = 'flex'; 
        });
    });

    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    function validateCheckboxes() {
        if (ageCheck.checked && tosCheck.checked) {
            confirmBtn.disabled = false;
            confirmBtn.classList.add('active');
        } else {
            confirmBtn.disabled = true;
            confirmBtn.classList.remove('active');
        }
    }

    ageCheck.addEventListener('change', validateCheckboxes);
    tosCheck.addEventListener('change', validateCheckboxes);

   confirmBtn.addEventListener('click', () => {
        if (!confirmBtn.disabled) {
            modal.style.display = 'none';
            
            const tagsInput = document.getElementById('topic-input').value;
            const urlParams = new URLSearchParams();
            if (tagsInput.trim()) {
                urlParams.set('tags', tagsInput);
            }

            if (chatTypeSelection === 'video') {
                const queryString = tagsInput.trim() ? '?' + urlParams.toString() : '';
                window.location.href = '/chat' + queryString;
            } else if (chatTypeSelection === 'text') {
                alert('Text chat coming soon!');
            }
        }
    });
});