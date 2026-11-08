//! Enveloppe native de Cigale : une fenêtre qui affiche l'application web (dossier `dist/`).
//! Les fichiers (ouvrir, enregistrer, copie `.bak`) passent par les plugins dialog et fs, côté JavaScript.
//! Ici : la barre des menus en français, et l'ouverture d'un PDF par double-clic dans le Finder
//! (« Ouvrir avec »), y compris quand Cigale n'est pas encore lancée.

use std::sync::Mutex;
#[cfg(target_os = "macos")]
use tauri::menu::{AboutMetadata, Menu, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Default)]
struct Opens {
    /// Vrai une fois que l'interface a récupéré les fichiers reçus au démarrage.
    ready: Mutex<bool>,
    /// Fichiers demandés par le système avant que l'interface soit prête.
    pending: Mutex<Vec<String>>,
}

/// Appelée par l'interface au démarrage : renvoie (et vide) la liste des fichiers à ouvrir.
#[tauri::command]
fn take_pending_opens(state: tauri::State<Opens>) -> Vec<String> {
    *state.ready.lock().unwrap() = true;
    std::mem::take(&mut *state.pending.lock().unwrap())
}

/// Redémarre Cigale après une mise à jour, sans deuxième icône dans le Dock. Le redémarrage de Tauri lance `open -n` (une nouvelle
/// instance) pendant que l'ancienne tourne encore : le Dock montre deux icônes, et celle en trop peut rester. Ici, un petit script
/// détaché attend la fin de ce processus, puis rouvre l'application (sans `-n` : une seule instance, la même icône).
#[tauri::command]
fn relaunch_app(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use std::os::unix::process::CommandExt;
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        // …/Cigale.app/Contents/MacOS/cigale → …/Cigale.app
        let bundle = exe.ancestors().nth(3).filter(|b| b.extension().is_some_and(|e| e == "app")).ok_or("application hors d'un .app")?;
        let script = format!("while kill -0 {pid} 2>/dev/null; do sleep 0.2; done; /usr/bin/open \"$1\"", pid = std::process::id());
        std::process::Command::new("/bin/sh")
            .arg("-c")
            .arg(script)
            .arg("cigale")
            .arg(bundle)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .process_group(0)
            .spawn()
            .map_err(|e| e.to_string())?;
        app.exit(0);
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        app.restart()
    }
}

/// Quitte vraiment l'application (appelée par l'interface une fois les modifications réglées).
#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// Barre des menus du Mac en français (celle de Tauri par défaut est en anglais). Les commandes d'édition
/// restent les éléments du système : ⌘C, ⌘V… arrivent ainsi à la page comme avant.
#[cfg(target_os = "macos")]
fn french_menu<R: tauri::Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let about = AboutMetadata { name: Some("Cigale".into()), ..Default::default() };
    let sep = || PredefinedMenuItem::separator(app);
    Menu::with_items(
        app,
        &[
            &Submenu::with_items(
                app,
                "Cigale",
                true,
                &[
                    &PredefinedMenuItem::about(app, Some("À propos de Cigale"), Some(about))?,
                    &sep()?,
                    &PredefinedMenuItem::services(app, Some("Services"))?,
                    &sep()?,
                    &PredefinedMenuItem::hide(app, Some("Masquer Cigale"))?,
                    &PredefinedMenuItem::hide_others(app, Some("Masquer les autres"))?,
                    &PredefinedMenuItem::show_all(app, Some("Tout afficher"))?,
                    &sep()?,
                    &PredefinedMenuItem::quit(app, Some("Quitter Cigale"))?,
                ],
            )?,
            &Submenu::with_items(app, "Fichier", true, &[&PredefinedMenuItem::close_window(app, Some("Fermer la fenêtre"))?])?,
            &Submenu::with_items(
                app,
                "Édition",
                true,
                &[
                    &PredefinedMenuItem::cut(app, Some("Couper"))?,
                    &PredefinedMenuItem::copy(app, Some("Copier"))?,
                    &PredefinedMenuItem::paste(app, Some("Coller"))?,
                    &PredefinedMenuItem::select_all(app, Some("Tout sélectionner"))?,
                ],
            )?,
            &Submenu::with_items(app, "Présentation", true, &[&PredefinedMenuItem::fullscreen(app, Some("Plein écran"))?])?,
            &Submenu::with_items(
                app,
                "Fenêtre",
                true,
                &[&PredefinedMenuItem::minimize(app, Some("Réduire"))?, &PredefinedMenuItem::maximize(app, Some("Agrandir"))?],
            )?,
        ],
    )
}

/// Les arguments qui sont des fichiers PDF existants (Windows : « Ouvrir avec », double-clic).
#[cfg(windows)]
fn pdf_args(args: impl Iterator<Item = String>, cwd: Option<&str>) -> Vec<String> {
    args.filter(|a| !a.starts_with('-') && a.to_lowercase().ends_with(".pdf"))
        // un chemin relatif se lit depuis le dossier de la commande qui a lancé Cigale, pas celui de l'instance déjà ouverte
        .map(|a| match cwd {
            Some(dir) if std::path::Path::new(&a).is_relative() => std::path::Path::new(dir).join(&a).to_string_lossy().into_owned(),
            _ => a,
        })
        .filter(|a| std::path::Path::new(a).is_file())
        .collect()
}

/// Donne des fichiers à ouvrir à l'interface (tout de suite si elle tourne, sinon au démarrage). Chaque fichier
/// est ajouté aux accès autorisés (le disque D:, une clé USB… ne sont pas dans les dossiers prévus par défaut).
fn deliver(app: &AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    use tauri_plugin_fs::FsExt;
    for p in &paths {
        if let Some(dir) = std::path::Path::new(p).parent() {
            let _ = app.fs_scope().allow_directory(dir, false);
        }
    }
    let state = app.state::<Opens>();
    if *state.ready.lock().unwrap() {
        // L'interface tourne déjà : elle ouvre chaque fichier dans un nouvel onglet.
        let _ = app.emit("cigale://open", paths);
    } else {
        state.pending.lock().unwrap().extend(paths);
    }
}

pub fn run() {
    let builder = tauri::Builder::default();
    // Windows : pas de barre de menus du système (l'application a son propre menu « Fichier »).
    #[cfg(target_os = "macos")]
    let builder = builder.menu(|app| french_menu(app));
    // Windows : un double-clic sur un deuxième PDF relance Cigale ; la nouvelle instance transmet le fichier à celle qui tourne.
    #[cfg(windows)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
        deliver(app, pdf_args(argv.into_iter().skip(1), Some(&cwd)));
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.unminimize();
            let _ = w.set_focus();
        }
    }));
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // Mises à jour automatiques (Releases GitHub signées) : vérification et installation depuis l'interface.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Opens::default())
        .invoke_handler(tauri::generate_handler![take_pending_opens, quit_app, relaunch_app])
        .setup(|app| {
            // Windows : le PDF double-cliqué arrive dans les arguments de la ligne de commande.
            #[cfg(windows)]
            deliver(app.handle(), pdf_args(std::env::args().skip(1), None));
            let _ = app;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("erreur au démarrage de Cigale")
        .run(|app, event| {
            // ⌘Q ou « Quitter Cigale » : on laisse l'interface vérifier les documents modifiés avant de quitter.
            // Mac seulement : sous Windows, fermer la fenêtre (déjà confirmée par l'interface) DOIT arrêter le programme. Sinon
            // il reste invisible en tâche de fond et reçoit les doubles-clics suivants sur un PDF sans pouvoir les afficher.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::ExitRequested { api, code, .. } = &event {
                if code.is_none() {
                    api.prevent_exit();
                    let _ = app.emit("cigale://quit-request", ());
                }
            }
            // macOS : double-clic sur un PDF (ou « Ouvrir avec Cigale »).
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = &event {
                let paths: Vec<String> = urls
                    .iter()
                    .filter_map(|u| u.to_file_path().ok())
                    .map(|p| p.to_string_lossy().into_owned())
                    .collect();
                if paths.is_empty() {
                    return;
                }
                deliver(app, paths);
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.set_focus();
                }
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
}
