# Krzywa — interaktywna tier lista z rozkładem Gaussa

Samodzielna aplikacja statyczna napisana w HTML, CSS i Vanilla JavaScript. Korzysta z oryginalnej bazy profili i grafik z archiwum `lisa.zip`; nie potrzebuje backendu, konta ani zewnętrznych bibliotek.

## Uruchomienie na Windows

1. Rozpakuj ZIP aplikacji do wybranego folderu.
2. Uruchom `run-local.bat` albo `run-local.ps1`. Możesz też otworzyć PowerShell w tym folderze i wpisać `py -m http.server 8000`.
3. Otwórz [http://localhost:8000](http://localhost:8000) w przeglądarce.

Skrypt PowerShell czeka na gotowość serwera, otwiera stronę i zatrzymuje serwer po naciśnięciu Enter. Przy ręcznym uruchomieniu polecenia Python zakończ serwer skrótem Ctrl+C.

Nie otwieraj `index.html` dwuklikiem: przeglądarki blokują odczyt plików JSON przez `file://`. Serwer HTTP podaje wyłącznie pliki statyczne. Jeśli `run-local.bat` zgłosi brak Pythona, użyj Visual Studio Code z rozszerzeniem Live Server albo zainstaluj Python 3.

## Publikacja w GitHub Pages

1. Wgraj całą zawartość tego folderu do repozytorium GitHub, zachowując katalogi `political_profiles/`, `images/` i `js/`.
2. W ustawieniach repozytorium wybierz **Pages** i jako źródło ustaw gałąź z aplikacją oraz katalog główny.
3. Po publikacji otwórz wygenerowany adres Pages. Aplikacja pobierze JSON z tego samego adresu.

W przypadku publikacji z podkatalogu repozytorium ścieżki pozostają względne, więc nie trzeba zmieniać konfiguracji.

## Baza danych

Manifest `political_profiles/manifest.json` wskazuje pliki źródłowe. Aplikacja odczytuje je bezpośrednio i nie kopiuje rekordów do osobnej, uproszczonej bazy:

- figury: 287 rekordów w `figures-A.json`–`figures-Z.json` (bez pliku dla Q),
- ideologie: 114 rekordów,
- partie: 27 rekordów,
- użytkownicy: 1 rekord; w źródle `users.json` jest pojedynczym obiektem, a nie tablicą.

Łącznie jest 429 unikalnych profili. Pola identyfikatorów to m.in. `id`, `key`, `name`, `logo`, `tags`, `tagGroups` i `infobox`; dłuższe opisy, historia i pozostałe pola są dostępne w szczegółach profilu. Ścieżki zdjęć są zgodne z polami `logo`, np. `images/Figury/...`. Brak albo uszkodzenie grafiki pokazuje fallback i nie zatrzymuje aplikacji.

Oryginalne pliki danych, grafiki, `advanced-tags.js`, `advanced-tags.css` oraz pliki z `tests/` zostały zachowane. Nowy interfejs jest niezależny od oryginalnej aplikacji.

## Funkcje

- Kategorie Figury, Partie, Ideologie, Użytkownicy i Wszystko.
- Krótkie, uporządkowane filtry zamiast listy wszystkich pól profilu. Partie korzystają z sześciu grup `tagGroups`, ideologie z grup modelu ideologii i „Pozostałe”, a figury z grup zawodu, urzędu, narodowości, statusu, płci, okresu życia, ideologii, kontynentu, legitymizacji, religii i pozostałych tagów. Długie teksty pozostają w szczegółach profilu i wyszukiwarce.
- Wartości w obrębie grupy łączą się przez OR, różne grupy przez AND. Kliknięcie uwzględnia wartość, Shift+klik ją wyklucza.
- Filtr czasu przyjmuje pojedynczy rok (np. `2025`) lub zakres (np. `1939–1945`). Puste pole pokazuje wszystkie profile. Dla figur porównuje lata urodzenia i śmierci, a dla partii daty powstania i rozwiązania oraz okresy z tagów. Przy aktywnym filtrze roku rekordy bez dat są pomijane; w widoku „Wszystko” ideologie i użytkownicy pozostają widoczni.
- Wyszukiwanie nazw, opisów i atrybutów; licznik puli oraz podgląd profili.
- Domyślne poziomy S–F, edycja 3–13 poziomów, nazw, kolorów i kolejności.
- Rozkład normalny z presetami wąskim, standardowym i szerokim oraz własnym σ. Limity bazowe są zaokrąglane metodą największych reszt, a ich suma jest dokładnie równa liczbie profili. W razie nierozstrzygalnego remisu zaokrąglenie pozostaje symetryczne; przy parzystej liczbie poziomów i nieparzystej puli jeden środkowy poziom otrzymuje o jedno miejsce więcej, ponieważ całkowite limity nie mogą wtedy być idealnie lustrzane.
- Luźny wariant limitów pokazuje oddzielnie bazę i margines; margines to 10% puli (zaokrąglone w górę), rozdzielone tą samą krzywą.
- Natywne Drag & Drop, kolejność w tierze, przenoszenie dotykiem przez szczegóły profilu, blokada limitu i zamiana z profilem zajmującym miejsce.
- Losowe rozmieszczenie wszystkich pasujących lub zaznaczonych profili, mieszanie puli, sortowanie alfabetyczne.
- Wiele projektów, autosave w LocalStorage, Undo/Redo, import i eksport JSON.
- Eksport PNG bez biblioteki, tekstowe zestawienie i kopiowanie go do schowka.
- Statystyki zajętości, wolnych miejsc, realizacji listy i najczęstszych tagów.
- Trzy motywy, responsywny układ, ustawienia rozmiaru kafelków, odstępów, nazw i slotów.

## Dane i projekty

Projekty zapisują się w pamięci przeglądarki. Są przypisane do konkretnej przeglądarki i adresu strony; ZIP z projektem można przenieść między urządzeniami. Eksport projektu przechowuje konfigurację i przypisania profili, a nie kopiuje całej bazy ani zdjęć. Import zachowuje identyfikatory rozpoznane w dołączonych danych; nieznane identyfikatory są pomijane.

Zmiana filtrów lub okresu nie kasuje przypisań profili, które przestają być widoczne. Jeżeli po zmianie aktywny limit danego tieru jest za mały, nadmiarowe widoczne profile wracają do dolnej puli i aplikacja pokazuje komunikat.

## Ograniczenia

- Przeglądarka musi udostępniać pamięć LocalStorage; wyczyszczenie danych witryny usuwa projekty niezapisane do JSON.
- PNG jest pojedynczym, wysokim obrazem bieżących tierów; przy bardzo dużej liście lepiej użyć eksportu JSON lub tekstowego.
- Aplikacja nie aktualizuje samodzielnie zawartości bazy. Aby użyć nowszych rekordów, należy podmienić pliki źródłowe i zachować ich identyfikatory oraz ścieżki grafik.
