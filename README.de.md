# Easy Imagemap

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.20555865.svg)](https://doi.org/10.5281/zenodo.20555865)

Easy Imagemap ist ein REDCap External Module, das ein Inline-Bild in einem beschreibenden Feld in eine klickbare Imagemap verwandelt. Das ist hilfreich, wenn ein Auswahlfeld einfacher, sicherer oder schneller über eine Region in einem Bild ausgefüllt werden kann als über eine lange Liste von Auswahlmöglichkeiten. Typische Beispiele sind Körperkarten, Gelenkzählungen, Wunddiagramme, Zahnschemata, Proben- oder Präparatediagramme und andere strukturierte klinische oder Registerformulare, bei denen die visuelle Position relevant ist.

Das Modul ist bewusst REDCap-nativ aufgebaut. Das Ausgangsbild muss an ein beschreibendes Feld angehängt und im Data Dictionary inline angezeigt werden. Die klickbaren Bereiche werden im Parameter des Action Tags `@EASYIMAGEMAP` in demselben beschreibenden Feld gespeichert. Damit bleibt die Konfiguration Teil der Projektmetadaten und kann wie andere Änderungen am Instrumentendesign geprüft, exportiert, in Entwürfen bearbeitet und migriert werden.

Auf Dateneingabeformularen und Umfragen rendert das Modul ein responsives SVG-Overlay über dem REDCap-Inline-Bild. Jeder SVG-Bereich ist mit einem REDCap-Feld oder einer Auswahl verknüpft. Ein Klick oder Tippen auf den Bereich kann die REDCap-Eingabe aktualisieren; im Zwei-Wege-Modus können Änderungen an der REDCap-Eingabe auch den Auswahlzustand des Bildbereichs aktualisieren.

![Ein REDCap-Dateneingabeformular mit einem Inline-Anatomiebild und mehreren hervorgehobenen klickbaren Bereichen.](screenshots/data-entry-imagemap.png)

Hinweis: Die Beispielkarte zur Gelenkauswahl verwendet eine Skelettillustration, die von _Servier Medical Art_ abgeleitet ist und unter CC BY 4.0 lizenziert wurde. Klickbare Bereiche und Hervorhebungen sind Easy Imagemap-SVG-Overlays und nicht Teil des Ausgangsbildes. Das Beispielbild und die Demo-Felder dienen nur zur Demonstration der Feldinteraktion. Sie sind nicht dazu bestimmt, ein klinisches Scoring-Instrument zu definieren.

## Warum keine klassische HTML-Imagemap?

Easy Imagemap benötigt kein eigenes HTML, kein externes Bildhosting und keine manuell gepflegten Koordinatenlisten. Das Bild ist ein normales REDCap-Inline-Bild, die Imagemap-Konfiguration wird im Action Tag des beschreibenden Feldes gespeichert und das Overlay wird zur Laufzeit responsiv erzeugt. Dadurch bleibt die Konfiguration prüfbar, exportierbar und mit den normalen REDCap-Workflows für das Projektdesign kompatibel.

## Umfang

Easy Imagemap unterstützt ausschließlich beschreibende Felder mit Inline-Bildern. Externe Bild-URLs, Dateien aus dem File Repository und beliebige HTML-Bildquellen werden nicht unterstützt.

Klickbare Bereiche können diese REDCap-Feldtypen auf demselben Instrument oder derselben Umfrageseite ansteuern:

- `checkbox`
- `radio`
- `select`, einschließlich Autocomplete-Dropdowns
- `yesno`
- `truefalse`

Der Designer unterstützt vier Bereichsformen:

- Polygon
- Rechteck
- Kreis
- Ellipse

## Einrichtung

Aktivieren Sie das External Module für das Projekt und öffnen Sie anschließend den Online Designer. Benutzer benötigen REDCap-Designrechte, um Imagemaps zu konfigurieren.

Erstellen oder wählen Sie ein **beschreibendes Feld mit einem inline angezeigten Bild**. Fügen Sie im Bereich für Feldannotation bzw. Action Tags Folgendes hinzu:

```text
@EASYIMAGEMAP
```

Nachdem der Action Tag hinzugefügt wurde, zeigt der Online Designer bei diesem beschreibenden Feld eine Schaltfläche **Imagemap konfigurieren** an.

![Der REDCap Online Designer mit einem beschreibenden Bildfeld und der Schaltfläche Imagemap konfigurieren.](screenshots/online-designer-configure-button.png)

Klicken Sie auf **Imagemap konfigurieren**, um den visuellen Designer zu öffnen. Beim ersten Speichern schreibt der Designer kanonisches JSON in den Action-Tag-Parameter:

```text
@EASYIMAGEMAP={
    "version": 1,
    "bounds": { "width": 500, "height": 467 },
    "styles": { "default": {} },
    "shapes": []
}
```

Das Modul kann leere Parameter, das aktuelle Format `version: 1` und ältere Demo-Daten lesen, die nummerierte Einträge mit `points`, `_w`, `_h` und Zielen im Format `field::code` verwendet haben. Legacy-Daten werden beim Anzeigen oder Bearbeiten im Speicher normalisiert. Sie werden erst neu geschrieben, wenn die Imagemap im Designer gespeichert wird.

In Produktionsprojekten muss der REDCap-Entwurfsmodus geöffnet sein, bevor Easy Imagemap-Änderungen gespeichert werden können. Befindet sich das Projekt in Produktion ohne geöffneten Entwurfsmodus, verweigert der Designer das Speichern.

## Überblick über den Designer

Der Designer besteht aus drei Hauptbereichen: Werkzeugleiste, Bildfläche und Zuordnungstabelle. Das optionale Stil-Panel kann geöffnet werden, wenn Farben und Rahmen angepasst werden sollen.

![Der Easy Imagemap-Designer mit Werkzeugleiste, Bildfläche, Zuordnungstabelle und Umschalter für das Stil-Panel.](screenshots/designer-overview-toolbar.png)

Die Werkzeugleiste steuert:

- **Vorschau**: Bereichsauswahl vorübergehend im Designer testen.
- **Zoom**: Bild von 50 % bis 400 % skalieren.
- **Modus**: zwischen dem Bearbeiten einer einzelnen Form und dem gemeinsamen Verschieben einer oder mehrerer ausgewählter Formen wechseln.
- **Form**: Polygon, Rechteck, Kreis oder Ellipse für den aktiven Bereich auswählen.
- **Aktualisierung**: festlegen, wie der aktive Bereich an REDCap-Daten gebunden wird.

Der Bearbeitungsmodus ist für präzise Änderungen an Griffpunkten des aktiven Bereichs gedacht. Der Verschiebemodus ist für Layout-Arbeit gedacht: Wählen Sie einen oder mehrere Bereiche aus und ziehen Sie dann eine beliebige ausgewählte Form, um die gesamte Auswahl gemeinsam zu verschieben.

Die Zuordnungstabelle enthält eine Zeile pro klickbarem Bereich. Eine Zeile speichert die Form, den ausgewählten Stil, das Zielfeld oder die Zielauswahl und den Aktualisierungsmodus des Bereichs. Über die Aktionsschaltflächen können Sie eine Zeile hinzufügen, duplizieren oder entfernen.

![Die Zuordnungstabelle mit Zeilen für klickbare Bereiche, Ziel-Dropdowns, Stil-Vorschauen und Zeilenaktionen.](screenshots/designer-assignment-table.png)

## Bereiche erstellen

Beginnen Sie, indem Sie in der Zuordnungstabelle eine Bereichszeile hinzufügen. Wählen Sie die Zeile zur Bearbeitung aus, wählen Sie einen Formtyp und definieren Sie anschließend die Form auf dem Bild.

Bei Polygonen klicken Sie auf das Bild, um Eckpunkte hinzuzufügen. Ziehen Sie einen Eckpunkt-Griff, um ihn neu zu positionieren. Ziehen Sie den quadratischen Mittelpunktgriff, um das gesamte Polygon zu verschieben. Der aktive Polygon-Eckpunkt wird mit einem kurzen Richtungsstrich markiert; neue Eckpunkte werden relativ zu diesem aktiven Eckpunkt eingefügt. Mit `Tab` wechseln Sie zwischen Griffpunkten, mit `Backspace` entfernen Sie den aktiven Polygon-Eckpunkt.

Bei Kreisen klicken und ziehen Sie vom Mittelpunkt aus, um den Radius festzulegen. Später können Sie den quadratischen Mittelpunktgriff ziehen, um den Kreis zu verschieben, oder den Umfangsgriff ziehen, um den Radius zu ändern. Halten Sie `Ctrl` gedrückt, während Sie den Umfangsgriff ziehen, um radiale Hilfslinien anzuzeigen und den Griff auf 45-Grad-Richtungen vom Mittelpunkt einrasten zu lassen.

Bei Rechtecken klicken und ziehen Sie, um die Form zu platzieren. Ziehen Sie den quadratischen Mittelpunktgriff, um sie zu verschieben, die Seitengriffe, um entlang der jeweiligen Achse zu skalieren oder zu drehen, oder den Eckgriff, um unter Beibehaltung des Seitenverhältnisses zu skalieren und zu drehen. Halten Sie `Ctrl` gedrückt, während Sie einen Nicht-Mittelpunktgriff ziehen, um radiale Hilfslinien anzuzeigen und den gezogenen Griff auf 45-Grad-Richtungen vom Mittelpunkt einrasten zu lassen. Halten Sie `Shift` gedrückt, während Sie einen Achsgriff ziehen, um Breite und Höhe gemeinsam zu ändern.

Bei Ellipsen klicken und ziehen Sie, um die Form zu platzieren. Ziehen Sie den quadratischen Mittelpunktgriff, um sie zu verschieben, die x-/y-Radiusgriffe, um die Achsen zu skalieren oder zu drehen, oder den Eckgriff, um unter Beibehaltung des Seitenverhältnisses zu skalieren und zu drehen. Halten Sie `Ctrl` gedrückt, während Sie einen Nicht-Mittelpunktgriff ziehen, um radiale Hilfslinien anzuzeigen und den gezogenen Griff auf 45-Grad-Richtungen vom Mittelpunkt einrasten zu lassen. Halten Sie `Shift` gedrückt, während Sie einen Achsgriff ziehen, um die Radien synchron zu halten.

![Beispiele für die Formbearbeitung mit Polygon-Eckpunkten, quadratischen Mittelpunktgriffen, Kreisradiusgriffen, Rechteckgriffen und Ellipsengriffen.](screenshots/designer-shape-handles.png)

Wenn der Formtyp eines bestehenden Bereichs geändert wird, konvertiert der Designer die Geometrie, anstatt sie zu löschen. Rechtecke werden in eingeschriebene Kreise oder Ellipsen konvertiert, Kreise und Ellipsen in umschließende Rechtecke, und Polygone werden in oder aus einer äußeren Begrenzungsform konvertiert. Der Designer fragt vor der Konvertierung nach einer Bestätigung und kann die Entscheidung im Browser merken.

Nützliche Bearbeitungs-Shortcuts:

- `Ctrl`-Klick auf einen Bereich im Bearbeitungsmodus fügt ihn der aktuellen Auswahl hinzu. Im Verschiebemodus fügt `Ctrl`-Klick auf einen nicht ausgewählten Bereich diesen der Auswahl hinzu.
- Mit dem Zoom-Slider oder dem Mausrad über der Bildfläche zoomen Sie in 5-%-Schritten. Die Zoom-Schaltflächen verwenden adaptive Schritte von 25 % oder 50 % oder setzen den Zoom auf 100 % zurück.
- Halten Sie `Space` gedrückt und ziehen Sie die Bildfläche, um die gezoomte Ansicht zu verschieben.
- Ziehen Sie im Bearbeitungsmodus den quadratischen Mittelpunktgriff, um die aktive Form zu verschieben.
- Halten Sie `Ctrl` gedrückt, während Sie im Bearbeitungsmodus einen Mittelpunktgriff ziehen, um radiale Hilfslinien anzuzeigen und die Bewegung auf 45-Grad-Richtungen ab dem Startpunkt des Ziehens zu beschränken.
- Halten Sie `Alt` gedrückt, während Sie im Bearbeitungsmodus den quadratischen Mittelpunktgriff ziehen, um die aktive Form zu duplizieren und die Kopie zu ziehen.
- Ziehen Sie im Verschiebemodus eine ausgewählte Form, um alle ausgewählten Formen gleichzeitig zu verschieben.
- Halten Sie `Alt` gedrückt, während Sie im Verschiebemodus ziehen, um verschobene Kopien der ausgewählten Formen zu erzeugen.
- Halten Sie `Ctrl` gedrückt, während Sie Formen im Verschiebemodus bewegen, um Bewegungsachsen anzuzeigen und die Bewegung auf 45-Grad-Schritte zu beschränken.
- Verwenden Sie die Pfeiltasten, um im Bearbeitungsmodus den aktiven Griff oder im Verschiebemodus alle ausgewählten Formen zu bewegen.
- Halten Sie `Shift` mit den Pfeiltasten gedrückt, um in 10-Pixel-Schritten statt in 1-Pixel-Schritten zu bewegen.
- Drücken Sie `Ctrl-S`, um zu speichern, ohne den Designer zu schließen.
- Drücken Sie `Delete` im Bearbeitungsmodus, um die Form des aktiven Bereichs zu löschen.
- Drücken Sie `Esc` im Bearbeitungsmodus, um den aktiven Bereich zu verlassen.
- Drücken Sie im Bearbeitungsmodus `m`, um in den Verschiebemodus zu wechseln, oder im Verschiebemodus `e`, um in den Bearbeitungsmodus zurückzuwechseln.

Die meisten Tastatur-Shortcuts für die Formbearbeitung werden ignoriert, während der Fokus in Eingabefeldern, Dropdowns, Schaltflächen oder anderen editierbaren Steuerelementen liegt. Dadurch stören sie nicht beim Zuordnen von Zielen oder Bearbeiten von Stilwerten.

## Bereiche REDCap-Feldern zuordnen

Jeder Bereich kann in der Zuordnungstabelle einem Ziel zugeordnet werden. Das Ziel-Dropdown listet unterstützte Felder auf demselben Instrument auf. Bei Feldern mit Auswahlmöglichkeiten listet das Dropdown jede Auswahl separat auf.

Checkbox-Ziele werden einzelnen Checkbox-Auswahlmöglichkeiten zugeordnet. Ein Bereich über dem linken Handgelenk könnte beispielsweise `joint_swollen:left_wrist` ansteuern. Ein Klick auf den Bereich schaltet diese Checkbox-Auswahl um.

Radio-, Ja/Nein-, Wahr/Falsch- und Select-Ziele werden jeweils einer Auswahl zugeordnet. Das Dropdown enthält außerdem eine Leer-/Zurücksetzen-Option für radioartige Felder. Das kann nützlich sein, wenn eine Bildregion ein Feld leeren soll, statt einen der codierten Werte auszuwählen.

Select-Ziele aktualisieren das zugrunde liegende Select-Feld und, wenn REDCap ein Autocomplete-Textfeld anzeigt, auch den sichtbaren Autocomplete-Wert.

![Das Ziel-Dropdown mit zuordenbaren Checkbox-, Radio- und Select-Auswahlmöglichkeiten für das aktuelle Instrument.](screenshots/designer-target-dropdown.png)

## Aktualisierungsmodi

Jeder Bereich hat einen Aktualisierungsmodus. Die Schaltflächen in der Werkzeugleiste wenden einen Modus auf den aktiven Bereich oder auf ausgewählte Zeilen an.

Verwenden Sie den **Zwei-Wege**-Modus, wenn Bild und REDCap-Eingabe synchron bleiben sollen. Ein Klick auf das Bild aktualisiert das Feld, und eine Änderung am Feld aktualisiert den Auswahlzustand im Bild. Dies ist die beste Voreinstellung für die meisten Dateneingaben, etwa Karten für druckschmerzhafte oder geschwollene Gelenke, die mit Checkbox-Auswahlen verknüpft sind.

Verwenden Sie den Modus **zum Ziel**, wenn das Bild in REDCap schreiben soll, der Bereich aber nicht auf spätere Feldänderungen reagieren muss. Das kann bei Schnellwahl-Bildern nützlich sein, bei denen der visuelle Zustand weniger wichtig ist als die Verwendung des Bildes als große, touch-freundliche Eingabe.

Verwenden Sie den Modus **vom Ziel**, wenn das Bild eine visuelle Anzeige von Daten sein soll und keine Eingabe. In diesem Modus ändert ein Klick auf den Bereich das REDCap-Feld nicht. Das kann bei Review-Formularen, Bestätigungsseiten in Umfragen oder Diagrammen nützlich sein, in denen ausgewählte Regionen vorhandene Werte anzeigen sollen, ohne Änderungen über das Bild zuzulassen.

![Die Aktualisierungsmodus-Werkzeugleiste mit Zwei-Wege-, Bild-zu-Ziel-, Ziel-zu-Bild- und Auf-Auswahl-Anwenden-Steuerung.](screenshots/designer-update-modes.png)

## Stile

Das Stil-Panel verwaltet benannte Stile. Jede Imagemap beginnt mit einem `default`-Stil, und jeder Bereich speichert nur den Namen des verwendeten Stils. Dadurch bleibt das JSON im Action Tag kleiner, und einheitliche Gestaltung wird einfacher.

Öffnen Sie das Stil-Panel, wenn Sie Farben, Deckkraft oder Konturstärke ändern möchten. Ein Stil hat drei Zustände:

- **Normal**: der Bereich, wenn er nicht mit der Maus berührt oder ausgewählt ist.
- **Hover**: der Bereich, während sich der Zeiger darüber befindet.
- **Ausgewählt**: der Bereich, wenn sein REDCap-Ziel ausgewählt ist oder wenn die Zeile im Designer-Vorschaumodus angehakt ist.

Für jeden Zustand können Sie Füllfarbe, Konturfarbe, Fülldeckkraft, Konturdeckkraft und Konturstärke bearbeiten. Das Stil-Panel kann außerdem einen Zustand kopieren, in einen anderen Zustand einfügen oder den aktiven Zustand über alle drei Zustände synchronisieren.

![Das Bereichs-Stil-Panel mit benannten Stilen, Vorschauen für Normal/Hover/Ausgewählt, Farbsteuerungen, Deckkraftsteuerungen und Kopieren/Einfügen/Synchronisieren-Schaltflächen.](screenshots/designer-style-panel.png)

Um einen Stil hinzuzufügen, klicken Sie auf die Hinzufügen-Schaltfläche neben der Stil-Auswahl, geben einen Namen ein und bestätigen. Um einen Stil zu löschen, wählen Sie ihn aus und verwenden die Löschen-Schaltfläche. Wenn der Stil Bereichen zugewiesen ist, fragt der Designer, welcher verbleibende Stil ihn ersetzen soll.

Die Zuordnungstabelle zeigt für jede Zeile eine kompakte Vorschau der drei Zustände, damit schnell erkennbar ist, welcher Stil zugewiesen ist.

## Vorschau und Speichern

Mit **Vorschau** können Sie Auswahlen im Designer testen, ohne den Online Designer zu verlassen. Ein Klick auf einen Bereich im Vorschaumodus schaltet die Auswahl-Checkbox der Zeile um und wendet den Ausgewählt-Stil an. Drücken Sie `Esc`, um den Vorschaumodus zu verlassen.

![Der aktive Vorschaumodus ermöglicht die Vorschau aller Bereiche in Normal-, Hover- und Ausgewählt-Zustand.](screenshots/designer-preview-mode.png)

Klicken Sie auf **Speichern**, um die aktuelle Imagemap in die REDCap-Metadaten zu schreiben, ohne den Designer zu schließen, oder auf **Speichern & schließen**, wenn die Imagemap fertig ist. `Ctrl-S` speichert ebenfalls ohne zu schließen. Wenn sich nichts geändert hat, aktualisiert das Modul die Projektmetadaten nicht und legt keinen Projekt-Logeintrag an. Wenn eine andere Person dieselbe Easy Imagemap-Konfiguration geändert hat, nachdem Sie den Designer geöffnet haben, fragt der Speicherdialog, ob die neuere Version überschrieben werden soll.

Beim Speichern wird der Action-Tag-Parameter des beschreibenden Feldes direkt in den REDCap-Metadaten aktualisiert. Die Änderung wird im Projekt-Log mit der Aktion `Design` protokolliert.

## Dateneingabe und Umfragen

Auf Dateneingabeformularen und Umfragen wartet Easy Imagemap, bis REDCap die Seite gerendert hat, sucht das Inline-Bild anhand des REDCap-Dokument-Hashes und legt ein SVG mit den gespeicherten Formen darüber. Das Overlay folgt Größenänderungen und Anpassungen des REDCap-Bildes, sodass es mit responsiven Umfrage-Layouts und auf mobilen bzw. touch-basierten Geräten funktioniert.

Ein Klick oder Tippen auf einen Bereich aktualisiert das konfigurierte REDCap-Feld, sofern sich der Bereich nicht im Modus `from-target` befindet und die Zieleingabe nicht deaktiviert oder gesperrt ist. Deaktivierte und gesperrte REDCap-Felder bleiben geschützt.

In mehrseitigen Umfragen wird eine Imagemap nur initialisiert, wenn sowohl das beschreibende Bildfeld als auch die Zielfelder auf der aktuellen Umfrageseite vorhanden sind. Dadurch werden keine klickbaren Bereiche für Felder erzeugt, die auf der Seite nicht vorhanden sind.

![Eine mobile Umfrageansicht mit einer responsiven Imagemap und touch-freundlichen klickbaren Regionen.](screenshots/survey-mobile-imagemap.png)

## Kompatibilität und Deployment

Der öffentliche Action Tag ist stabil:

```text
@EASYIMAGEMAP
```

Der aktuelle Designer speichert in dieser kanonischen Struktur:

```json
{
    "version": 1,
    "bounds": { "width": 500, "height": 467 },
    "styles": {
        "default": {}
    },
    "shapes": []
}
```

Das Modul bleibt beim Anzeigen von Dateneingabeformularen und Umfragen sowie beim Öffnen des Designers mit älteren unterstützten Parameterformaten kompatibel. Es migriert alte Parameter nicht automatisch im Hintergrund. Ein Legacy-Parameter wird erst dann kanonisch, wenn eine Benutzerin oder ein Benutzer im Designer speichert.

In Produktionsprojekten sollten Modulcode und Projektmetadaten gemeinsam bereitgestellt werden, wenn bestehende Imagemaps mit dem überarbeiteten Designer gespeichert werden sollen. Der REDCap-Entwurfsmodus muss geöffnet sein, bevor Änderungen in Produktionsprojekten gespeichert werden.

Ungültiges JSON im Action Tag bleibt ein harter Fehler und muss manuell behoben werden. Einzelne ungültige Bereiche werden bei der Anzeige nach Möglichkeit übersprungen, und die Validierung beim Speichern verhindert, dass unvollständige oder ungültige Designer-Bereiche unbemerkt gespeichert werden.

## Lizenz und Drittmaterial

Der Quellcode des Easy Imagemap-Moduls ist unter der MIT-Lizenz lizenziert. Diese Lizenz lizenziert kein Drittmaterial neu, das in der Dokumentation gezeigt oder referenziert wird, einschließlich REDCap-Benutzeroberflächen, REDCap-Namen und -Marken, zitierter oder demohaft verwendeter Grafiken wie der von Servier Medical Art abgeleiteten Beispielgrafik oder projektspezifischer Ausgangsbilder in Screenshots. Diese Materialien bleiben ihren jeweiligen Lizenzen, Bedingungen und Rechteinhabern unterworfen.

## Zitieren dieser Software

Wenn Sie dieses External Module für ein Projekt verwenden, aus dem ein Forschungsergebnis hervorgeht, zitieren Sie diese Software bitte zusätzlich zur [Zitation von REDCap](https://projectredcap.org/resources/citations/). Dies kann beispielsweise im APA-Stil erfolgen:

> Rezniczek, G. A. (2026). Easy Imagemap (REDCap External Module) [Computer software]. https://doi.org/10.5281/zenodo.20555865

Oder durch Aufnahme dieses Eintrags in Ihre BibTeX-Datenbank:

```bibtex
@software{Rezniczek_Easy_Imagemap_REDCap_EM_2026,
author = {Rezniczek, Günther A.},
doi = {10.5281/zenodo.20555865},
title = {{Easy Imagemap (REDCap External Module)}},
url = {https://github.com/grezniczek/redcap_imagemap},
version = {1.0.0},
year = {2026}
}
```

Diese Angaben sind auch auf [GitHub](https://github.com/grezniczek/redcap_imagemap) unter "Cite This Repository" verfügbar.

## Dieses Projekt unterstützen

Wenn Sie diese Software nützlich finden, können Sie mir [einen Kaffee oder ein Bier spendieren](https://www.paypal.com/donate/?hosted_button_id=6VRC2JFRCBGRN). Ihre Unterstützung ist rein freiwillig und hilft mir, dieses Projekt weiter zu verbessern. Natürlich entsteht daraus kein Anspruch auf besondere Vorteile - abgesehen von meiner stillen Wertschätzung beim Genuss des Getränks! 🍻☕

Sie können den Link oder den untenstehenden QR-Code verwenden, um über PayPal zu spenden.

![PayPal-QR-Code](images/qr-paypal.png)

_Bitte beachten Sie, dass Spenden rein freiwillig und nicht steuerlich absetzbar sind._


---

**Disclaimer**

Teile dieser Dokumentation und der Release-Politur wurden mit Unterstützung von OpenAIs ChatGPT/Codex entwickelt, um Klarheit, Konsistenz und Benutzerfreundlichkeit für REDCap-Projektdesigner zu fördern. Der endgültige Inhalt wurde vom Maintainer geprüft und angepasst, um die spezifische Funktionalität und die Standards des External Modules *Easy Imagemap* widerzuspiegeln.
