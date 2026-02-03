// --- PROFILE PHOTO UPLOAD ---

async function handlePhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Valida tamanho (máx 2MB)
    if (file.size > 2 * 1024 * 1024) {
        showNotification('A imagem deve ter no máximo 2MB', 'error');
        return;
    }

    const session = JSON.parse(localStorage.getItem('passionpro_session'));
    if (!session) return;

    try {
        // Preview local
        const reader = new FileReader();
        reader.onload = function (event) {
            updateAvatarUI(event.target.result);
        };
        reader.readAsDataURL(file);

        // Upload para Supabase Storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${session.id}.${fileExt}`;
        const filePath = `avatars/${fileName}`;

        const { error: uploadError } = await _supabase.storage
            .from('profile-photos')
            .upload(filePath, file, { upsert: true });

        if (uploadError) throw uploadError;

        // Obtém URL pública
        const { data: { publicUrl } } = _supabase.storage
            .from('profile-photos')
            .getPublicUrl(filePath);

        // Salva URL no perfil
        const { error: updateError } = await _supabase
            .from('vendedoras')
            .update({ avatar_url: publicUrl })
            .eq('id', session.id);

        if (updateError) throw updateError;

        // Atualiza localStorage
        session.avatar_url = publicUrl;
        localStorage.setItem('passionpro_session', JSON.stringify(session));

        // Mostra botão de remover
        document.getElementById('remove-photo-btn').style.display = 'inline-flex';

        showNotification('Foto de perfil atualizada!', 'success');
        lucide.createIcons();
    } catch (e) {
        console.error('Erro ao fazer upload:', e);
        showNotification('Erro ao enviar foto: ' + e.message, 'error');
    }
}

async function removeProfilePhoto() {
    const session = JSON.parse(localStorage.getItem('passionpro_session'));
    if (!session || !session.avatar_url) return;

    if (!confirm('Deseja realmente remover sua foto de perfil?')) return;

    try {
        // Remove do banco
        const { error } = await _supabase
            .from('vendedoras')
            .update({ avatar_url: null })
            .eq('id', session.id);

        if (error) throw error;

        // Atualiza localStorage
        delete session.avatar_url;
        localStorage.setItem('passionpro_session', JSON.stringify(session));

        // Restaura iniciais
        const initials = session.name.substring(0, 2).toUpperCase();
        updateAvatarUI(null, initials);

        document.getElementById('remove-photo-btn').style.display = 'none';
        showNotification('Foto de perfil removida', 'success');
    } catch (e) {
        console.error('Erro ao remover foto:', e);
        showNotification('Erro ao remover foto: ' + e.message, 'error');
    }
}

function updateAvatarUI(imageUrl, initials = null) {
    const avatars = [
        document.getElementById('display-user-avatar'),
        document.getElementById('profile-avatar-preview')
    ];

    avatars.forEach(avatar => {
        if (!avatar) return;

        if (imageUrl) {
            avatar.style.backgroundImage = `url(${imageUrl})`;
            avatar.style.backgroundSize = 'cover';
            avatar.style.backgroundPosition = 'center';
            avatar.textContent = '';
        } else if (initials) {
            avatar.style.backgroundImage = 'none';
            avatar.textContent = initials;
        }
    });
}
