// AdRazes E2E-kärna (Rust, vodozemac). Hela gränssnittet: JSON in, JSON ut. Se e2e-karna/src/lib.rs.
#ifndef ADRAZE_E2E_H
#define ADRAZE_E2E_H

#ifdef __cplusplus
extern "C" {
#endif

/// `indata`: NUL-avslutad UTF-8 med JSON, t.ex. {"op":"version"}. Svaret är JSON och frigörs med adraze_e2e_frigor.
char *adraze_e2e_anropa(const char *indata);

/// Nollar och frigör ett svar från adraze_e2e_anropa.
void adraze_e2e_frigor(char *svar);

#ifdef __cplusplus
}
#endif

#endif
