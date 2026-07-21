document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('login-btn');
    const erroDiv = document.getElementById('login-error');

    erroDiv.classList.remove('visible');
    erroDiv.textContent = '';

    if (!username || !password) return;

    btn.disabled = true;
    btn.textContent = 'Entrando...';

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const dados = await response.json();

        if (!response.ok) {
            erroDiv.textContent = dados.mensagem || 'Não foi possível entrar.';
            erroDiv.classList.add('visible');
            return;
        }

        window.location.href = '/';
    } catch (error) {
        erroDiv.textContent = 'Não foi possível conectar ao servidor.';
        erroDiv.classList.add('visible');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Entrar';
    }
});
