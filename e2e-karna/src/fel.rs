use std::fmt;

/// Ett fel som går tillbaka till Swift/JS som `{"ok":false,"fel":kod,"text":text}`.
///
/// Koder som klienterna kan reagera på:
/// - `manipulerat`  chiffret har ändrats eller öppnas med fel nyckel (MAC/tagg stämmer inte)
/// - `uppspelat`    meddelandet har redan tagits emot en gång
/// - `fel_mottagare` meddelandet var inte till den här enheten eller kontot
/// - `okand_enhet`  avsändarens enhet är inte signerad av avsändarens identitet
/// - `identitet_andrad` kontaktens identitetsnyckel har bytts (säkerhetsnumret ändrat)
/// - `ingen_identitet`, `format`, `okand_op`, `handtag`, …
#[derive(Debug, Clone)]
pub struct Fel {
    pub kod: &'static str,
    pub text: String,
}

impl Fel {
    pub fn new(kod: &'static str, text: impl Into<String>) -> Self {
        Self { kod, text: text.into() }
    }
}

impl fmt::Display for Fel {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.kod, self.text)
    }
}

impl std::error::Error for Fel {}

pub type R<T> = Result<T, Fel>;
