// Problem-Solving Puppets — the game IS this data.
//
// Engine: shared/js/engines/puppet-theater.js on the theater substrate
// (shared/js/stage/theater.js). The child casts two puppets (roles a = left,
// b = right), watches them act out a small social conflict, watches EVERY
// choice acted out as a preview, then taps the idea they like best. Multiple
// choices may be kind:true — kindness rarely has one right answer.
//
// AUTHORING RULES
// - `say` beats may ONLY use ids from the shared character line catalog
//   (shared/characters/<id>/voice/manifest.json — same 28 lines in all 8
//   voices). The `text` is the Web Speech fallback and must match the
//   recorded line word for word.
// - `narrator` keys resolve in ./assets/audio/manifest.json (teacher voice);
//   text fallback keeps every scenario playable before recording.
// - Scenario beats reference roles 'a' and 'b' only — any two characters can
//   play any scenario.
// - Setup ends ON the frozen problem tableau (each actor left on a looping
//   clip). Previews stay ≤ 4 beats; whole rounds stay inside the 30–90s loop.
// - Clips available: idle, wave, walk, jump, talk (rig) + sad, stomp, grab,
//   ask, offer, nod, head-shake, hug, cheer, think (shared acting pack).
// - Validate edits with the beat/catalog validator before shipping
//   (see game-design.md).

const scenarios = {
  "toy-truck": {
    "id": "toy-truck",
    "backdrop": "playroom",
    "props": {
      "truck": {
        "art": "./assets/props/toy-truck.png",
        "color": "#e8b23a",
        "scale": 0.4,
        "holder": "a",
        "handBone": "arm-lower.R",
        "handOffset": [
          0,
          110
        ]
      }
    },
    "setup": [
      {
        "narrator": "truck-setup",
        "text": "One puppet is playing with the toy truck. Here comes their friend!"
      },
      {
        "actor": "b",
        "enter": "right",
        "to": [
          0.7
        ],
        "ms": 1800
      },
      {
        "actor": "b",
        "say": "want-it",
        "text": "Ooh! I want to play with that too!"
      },
      {
        "actor": "a",
        "say": "had-it-first",
        "text": "But I had it first!"
      },
      {
        "parallel": [
          {
            "actor": "a",
            "clip": "stomp",
            "pose": {
              "$spine": {
                "bend": -0.06
              }
            }
          },
          {
            "actor": "b",
            "clip": "sad",
            "pose": {
              "head": {
                "rotation": 0.2
              }
            }
          }
        ]
      },
      {
        "narrator": "truck-problem",
        "text": "Uh oh! Both friends want the same truck."
      },
      {
        "actor": "a",
        "clip": "think"
      }
    ],
    "choices": [
      {
        "id": "grab",
        "kind": false,
        "card": {
          "art": "emoji:😾",
          "alt": "grab it away"
        },
        "ask": {
          "narrator": "truck-ask-grab",
          "text": "Should the friend grab the truck away?"
        },
        "preview": [
          {
            "actor": "b",
            "clip": "grab"
          },
          {
            "prop": "truck",
            "holder": "b"
          },
          {
            "actor": "a",
            "clip": "sad"
          },
          {
            "fx": "sad-puff",
            "at": "a"
          }
        ],
        "resolution": [
          {
            "actor": "b",
            "clip": "grab"
          },
          {
            "prop": "truck",
            "holder": "b"
          },
          {
            "actor": "b",
            "say": "mine-no",
            "text": "No! It's mine!"
          },
          {
            "actor": "a",
            "clip": "sad"
          },
          {
            "fx": "sad-puff",
            "at": "a"
          },
          {
            "actor": "a",
            "say": "im-sad",
            "text": "That makes me feel sad."
          },
          {
            "narrator": "truck-after-grab",
            "text": "Oh no. Grabbing made their friend feel sad."
          }
        ]
      },
      {
        "id": "ask-turn",
        "kind": true,
        "card": {
          "art": "emoji:🙋",
          "alt": "ask for a turn"
        },
        "ask": {
          "narrator": "truck-ask-ask",
          "text": "Should the friend ask for a turn, please?"
        },
        "preview": [
          {
            "actor": "b",
            "clip": "ask"
          },
          {
            "actor": "b",
            "say": "turn-please",
            "text": "May I have a turn, please?"
          },
          {
            "actor": "a",
            "clip": "nod"
          }
        ],
        "resolution": [
          {
            "actor": "b",
            "clip": "ask"
          },
          {
            "actor": "b",
            "say": "turn-please",
            "text": "May I have a turn, please?"
          },
          {
            "actor": "a",
            "clip": "nod"
          },
          {
            "actor": "a",
            "say": "sure-turn",
            "text": "Sure! You can have a turn!"
          },
          {
            "prop": "truck",
            "holder": "b"
          },
          {
            "actor": "b",
            "say": "thank-you",
            "text": "Thank you, friend!"
          },
          {
            "parallel": [
              {
                "actor": "a",
                "clip": "cheer"
              },
              {
                "actor": "b",
                "clip": "cheer"
              }
            ]
          },
          {
            "fx": "burst",
            "at": "truck"
          },
          {
            "narrator": "truck-after-ask",
            "text": "Asking with kind words worked! Both friends feel happy."
          }
        ]
      },
      {
        "id": "share",
        "kind": true,
        "card": {
          "art": "emoji:🤝",
          "alt": "share it together"
        },
        "ask": {
          "narrator": "truck-ask-share",
          "text": "Or could they roll the truck together?"
        },
        "preview": [
          {
            "actor": "a",
            "clip": "offer"
          },
          {
            "prop": "truck",
            "to": [
              0.5,
              "floor"
            ],
            "ms": 700
          },
          {
            "parallel": [
              {
                "actor": "a",
                "clip": "nod"
              },
              {
                "actor": "b",
                "clip": "nod"
              }
            ]
          }
        ],
        "resolution": [
          {
            "actor": "a",
            "clip": "offer"
          },
          {
            "actor": "a",
            "say": "lets-share",
            "text": "Let's play with it together!"
          },
          {
            "prop": "truck",
            "to": [
              0.5,
              "floor"
            ],
            "ms": 700
          },
          {
            "parallel": [
              {
                "actor": "a",
                "to": [
                  0.4
                ],
                "ms": 900
              },
              {
                "actor": "b",
                "to": [
                  0.6
                ],
                "ms": 900
              }
            ]
          },
          {
            "actor": "b",
            "say": "so-fun",
            "text": "This is so fun!"
          },
          {
            "parallel": [
              {
                "actor": "a",
                "clip": "cheer"
              },
              {
                "actor": "b",
                "clip": "cheer"
              }
            ]
          },
          {
            "fx": "burst",
            "at": "truck"
          },
          {
            "narrator": "truck-after-share",
            "text": "Sharing means everyone gets to play. Wonderful!"
          }
        ]
      }
    ]
  },
  "red-crayon": {
    "id": "red-crayon",
    "backdrop": "playroom",
    "props": {
      "crayon": {
        "art": "./assets/props/crayon.png",
        "color": "#e04a3a",
        "scale": 0.17,
        "holder": "a",
        "handBone": "arm-lower.R",
        "handOffset": [
          0,
          110
        ]
      }
    },
    "setup": [
      {
        "narrator": "red-crayon-setup",
        "text": "Both friends are drawing. But there is only one red crayon!"
      },
      {
        "actor": "b",
        "enter": "right",
        "to": [
          0.7
        ],
        "ms": 1800
      },
      {
        "actor": "b",
        "say": "want-it",
        "text": "Ooh! I want to play with that too!"
      },
      {
        "actor": "a",
        "say": "had-it-first",
        "text": "But I had it first!"
      },
      {
        "parallel": [
          {
            "actor": "a",
            "clip": "stomp",
            "pose": {
              "$spine": {
                "bend": -0.06
              }
            }
          },
          {
            "actor": "b",
            "clip": "sad",
            "pose": {
              "head": {
                "rotation": 0.2
              }
            }
          }
        ]
      },
      {
        "narrator": "red-crayon-problem",
        "text": "Uh oh! Both friends want the same red crayon."
      },
      {
        "actor": "a",
        "clip": "think"
      }
    ],
    "choices": [
      {
        "id": "grab",
        "kind": false,
        "card": {
          "art": "emoji:😾",
          "alt": "grab it away"
        },
        "ask": {
          "narrator": "red-crayon-ask-grab",
          "text": "Should the friend grab the red crayon away?"
        },
        "preview": [
          {
            "actor": "b",
            "clip": "grab"
          },
          {
            "prop": "crayon",
            "holder": "b"
          },
          {
            "actor": "a",
            "clip": "sad"
          },
          {
            "fx": "sad-puff",
            "at": "a"
          }
        ],
        "resolution": [
          {
            "actor": "b",
            "clip": "grab"
          },
          {
            "prop": "crayon",
            "holder": "b"
          },
          {
            "actor": "b",
            "say": "mine-no",
            "text": "No! It's mine!"
          },
          {
            "actor": "a",
            "clip": "sad"
          },
          {
            "fx": "sad-puff",
            "at": "a"
          },
          {
            "actor": "a",
            "say": "im-sad",
            "text": "That makes me feel sad."
          },
          {
            "narrator": "red-crayon-after-grab",
            "text": "Oh no. Grabbing made their friend feel sad."
          }
        ]
      },
      {
        "id": "take-turns",
        "kind": true,
        "card": {
          "art": "emoji:🔄",
          "alt": "take turns"
        },
        "ask": {
          "narrator": "red-crayon-ask-turns",
          "text": "Should they take turns with the red crayon?"
        },
        "preview": [
          {
            "actor": "a",
            "clip": "offer"
          },
          {
            "actor": "a",
            "say": "take-turns-idea",
            "text": "Let's take turns! You, then me!"
          },
          {
            "actor": "b",
            "clip": "nod"
          }
        ],
        "resolution": [
          {
            "actor": "a",
            "clip": "offer"
          },
          {
            "actor": "a",
            "say": "take-turns-idea",
            "text": "Let's take turns! You, then me!"
          },
          {
            "prop": "crayon",
            "holder": "b"
          },
          {
            "actor": "b",
            "say": "thank-you",
            "text": "Thank you, friend!"
          },
          {
            "actor": "a",
            "say": "your-turn-now",
            "text": "Your turn now!"
          },
          {
            "parallel": [
              {
                "actor": "a",
                "clip": "cheer"
              },
              {
                "actor": "b",
                "clip": "cheer"
              }
            ]
          },
          {
            "fx": "burst",
            "at": "crayon"
          },
          {
            "narrator": "red-crayon-after-turns",
            "text": "Taking turns means everyone gets the red crayon. Wonderful!"
          }
        ]
      },
      {
        "id": "offer-first",
        "kind": true,
        "card": {
          "art": "emoji:🤝",
          "alt": "offer it first"
        },
        "ask": {
          "narrator": "red-crayon-ask-offer",
          "text": "Or could one friend offer the red crayon first?"
        },
        "preview": [
          {
            "actor": "a",
            "clip": "offer"
          },
          {
            "prop": "crayon",
            "holder": "b"
          },
          {
            "actor": "b",
            "clip": "nod"
          }
        ],
        "resolution": [
          {
            "actor": "a",
            "clip": "offer"
          },
          {
            "actor": "a",
            "say": "sure-turn",
            "text": "Sure! You can have a turn!"
          },
          {
            "prop": "crayon",
            "holder": "b"
          },
          {
            "actor": "b",
            "say": "thank-you",
            "text": "Thank you, friend!"
          },
          {
            "parallel": [
              {
                "actor": "a",
                "clip": "cheer"
              },
              {
                "actor": "b",
                "clip": "cheer"
              }
            ]
          },
          {
            "fx": "burst",
            "at": "crayon"
          },
          {
            "narrator": "red-crayon-after-offer",
            "text": "Offering first is so kind. Both friends feel happy!"
          }
        ]
      }
    ]
  },
  "storybook": {
    "id": "storybook",
    "backdrop": "playroom",
    "props": {
      "book": {
        "art": "./assets/props/storybook.png",
        "color": "#4a7fd6",
        "scale": 0.3,
        "holder": "a",
        "handBone": "arm-lower.R",
        "handOffset": [
          0,
          110
        ]
      }
    },
    "setup": [
      {
        "narrator": "storybook-setup",
        "text": "One puppet has the only storybook. Their friend wants to look too!"
      },
      {
        "actor": "b",
        "enter": "right",
        "to": [
          0.7
        ],
        "ms": 1800
      },
      {
        "actor": "b",
        "say": "want-it",
        "text": "Ooh! I want to play with that too!"
      },
      {
        "actor": "a",
        "say": "had-it-first",
        "text": "But I had it first!"
      },
      {
        "parallel": [
          {
            "actor": "a",
            "clip": "stomp",
            "pose": {
              "$spine": {
                "bend": -0.06
              }
            }
          },
          {
            "actor": "b",
            "clip": "sad",
            "pose": {
              "head": {
                "rotation": 0.2
              }
            }
          }
        ]
      },
      {
        "narrator": "storybook-problem",
        "text": "Uh oh! Only one storybook, and both friends want to see."
      },
      {
        "actor": "a",
        "clip": "think"
      }
    ],
    "choices": [
      {
        "id": "hide",
        "kind": false,
        "card": {
          "art": "emoji:🙈",
          "alt": "hide it away"
        },
        "ask": {
          "narrator": "storybook-ask-hide",
          "text": "Should the puppet hide the storybook away?"
        },
        "preview": [
          {
            "actor": "a",
            "clip": "grab",
            "pose": {
              "head": {
                "rotation": -0.15
              }
            }
          },
          {
            "actor": "a",
            "say": "mine-no",
            "text": "No! It's mine!"
          },
          {
            "actor": "b",
            "clip": "sad"
          },
          {
            "fx": "sad-puff",
            "at": "b"
          }
        ],
        "resolution": [
          {
            "actor": "a",
            "clip": "grab",
            "pose": {
              "head": {
                "rotation": -0.15
              }
            }
          },
          {
            "actor": "a",
            "say": "mine-no",
            "text": "No! It's mine!"
          },
          {
            "actor": "b",
            "clip": "sad"
          },
          {
            "fx": "sad-puff",
            "at": "b"
          },
          {
            "actor": "b",
            "say": "im-sad",
            "text": "That makes me feel sad."
          },
          {
            "narrator": "storybook-after-hide",
            "text": "Oh no. Hiding it made their friend feel sad."
          }
        ]
      },
      {
        "id": "look-together",
        "kind": true,
        "card": {
          "art": "emoji:📖",
          "alt": "look together"
        },
        "ask": {
          "narrator": "storybook-ask-together",
          "text": "Could they look at the storybook together, side by side?"
        },
        "preview": [
          {
            "actor": "a",
            "clip": "offer"
          },
          {
            "parallel": [
              {
                "actor": "a",
                "to": [
                  0.4
                ],
                "ms": 900
              },
              {
                "actor": "b",
                "to": [
                  0.6
                ],
                "ms": 900
              }
            ]
          },
          {
            "actor": "a",
            "say": "lets-share",
            "text": "Let's play with it together!"
          }
        ],
        "resolution": [
          {
            "actor": "a",
            "clip": "offer"
          },
          {
            "actor": "a",
            "say": "lets-share",
            "text": "Let's play with it together!"
          },
          {
            "parallel": [
              {
                "actor": "a",
                "to": [
                  0.4
                ],
                "ms": 900
              },
              {
                "actor": "b",
                "to": [
                  0.6
                ],
                "ms": 900
              }
            ]
          },
          {
            "actor": "b",
            "say": "look-at-this",
            "text": "Wow! Look at this!"
          },
          {
            "parallel": [
              {
                "actor": "a",
                "clip": "cheer"
              },
              {
                "actor": "b",
                "clip": "cheer"
              }
            ]
          },
          {
            "fx": "burst",
            "at": "book"
          },
          {
            "narrator": "storybook-after-together",
            "text": "Looking together, both friends can see the story. Wonderful!"
          }
        ]
      },
      {
        "id": "take-turns",
        "kind": true,
        "card": {
          "art": "emoji:🔄",
          "alt": "take turns holding"
        },
        "ask": {
          "narrator": "storybook-ask-turns",
          "text": "Or could they take turns holding the storybook?"
        },
        "preview": [
          {
            "actor": "a",
            "clip": "offer"
          },
          {
            "actor": "a",
            "say": "take-turns-idea",
            "text": "Let's take turns! You, then me!"
          },
          {
            "actor": "b",
            "clip": "nod"
          }
        ],
        "resolution": [
          {
            "actor": "a",
            "clip": "offer"
          },
          {
            "actor": "a",
            "say": "take-turns-idea",
            "text": "Let's take turns! You, then me!"
          },
          {
            "prop": "book",
            "holder": "b"
          },
          {
            "actor": "b",
            "say": "thank-you",
            "text": "Thank you, friend!"
          },
          {
            "actor": "a",
            "say": "your-turn-now",
            "text": "Your turn now!"
          },
          {
            "parallel": [
              {
                "actor": "a",
                "clip": "cheer"
              },
              {
                "actor": "b",
                "clip": "cheer"
              }
            ]
          },
          {
            "fx": "burst",
            "at": "book"
          },
          {
            "narrator": "storybook-after-turns",
            "text": "Taking turns means everyone gets to hold the book. Great sharing!"
          }
        ]
      }
    ]
  },
  "big-ball": {
    "id": "big-ball",
    "backdrop": "playground",
    "props": {
      "ball": {
        "art": "./assets/props/ball.png",
        "color": "#e0563a",
        "scale": 0.35,
        "holder": "a",
        "handBone": "arm-lower.R",
        "handOffset": [
          0,
          110
        ]
      }
    },
    "setup": [
      {
        "narrator": "big-ball-setup",
        "text": "One puppet is bouncing the big ball. Here comes their friend!"
      },
      {
        "actor": "b",
        "enter": "right",
        "to": [
          0.7
        ],
        "ms": 1800
      },
      {
        "actor": "b",
        "say": "want-it",
        "text": "Ooh! I want to play with that too!"
      },
      {
        "actor": "a",
        "say": "had-it-first",
        "text": "But I had it first!"
      },
      {
        "parallel": [
          {
            "actor": "a",
            "clip": "stomp",
            "pose": {
              "$spine": {
                "bend": -0.06
              }
            }
          },
          {
            "actor": "b",
            "clip": "sad",
            "pose": {
              "head": {
                "rotation": 0.2
              }
            }
          }
        ]
      },
      {
        "narrator": "big-ball-problem",
        "text": "Uh oh! One friend has the ball, and both want to play."
      },
      {
        "actor": "a",
        "clip": "think"
      }
    ],
    "choices": [
      {
        "id": "play-alone",
        "kind": false,
        "card": {
          "art": "emoji:🙅",
          "alt": "play alone"
        },
        "ask": {
          "narrator": "big-ball-ask-alone",
          "text": "Should the puppet turn away and play alone?"
        },
        "preview": [
          {
            "actor": "a",
            "clip": "head-shake"
          },
          {
            "actor": "a",
            "to": [
              0.15
            ],
            "ms": 900
          },
          {
            "actor": "b",
            "clip": "sad"
          },
          {
            "fx": "sad-puff",
            "at": "b"
          }
        ],
        "resolution": [
          {
            "actor": "a",
            "clip": "head-shake"
          },
          {
            "actor": "a",
            "say": "mine-no",
            "text": "No! It's mine!"
          },
          {
            "actor": "a",
            "to": [
              0.15
            ],
            "ms": 900
          },
          {
            "actor": "b",
            "clip": "sad"
          },
          {
            "fx": "sad-puff",
            "at": "b"
          },
          {
            "actor": "b",
            "say": "im-sad",
            "text": "That makes me feel sad."
          },
          {
            "narrator": "big-ball-after-alone",
            "text": "Oh no. Playing alone made their friend feel sad."
          }
        ]
      },
      {
        "id": "roll-together",
        "kind": true,
        "card": {
          "art": "emoji:🤝",
          "alt": "roll it together"
        },
        "ask": {
          "narrator": "big-ball-ask-roll",
          "text": "Could they roll the big ball back and forth together?"
        },
        "preview": [
          {
            "actor": "a",
            "clip": "offer"
          },
          {
            "prop": "ball",
            "to": [
              0.5,
              "floor"
            ],
            "ms": 700
          },
          {
            "parallel": [
              {
                "actor": "a",
                "to": [
                  0.4
                ],
                "ms": 900
              },
              {
                "actor": "b",
                "to": [
                  0.6
                ],
                "ms": 900
              }
            ]
          }
        ],
        "resolution": [
          {
            "actor": "a",
            "clip": "offer"
          },
          {
            "actor": "a",
            "say": "lets-share",
            "text": "Let's play with it together!"
          },
          {
            "prop": "ball",
            "to": [
              0.5,
              "floor"
            ],
            "ms": 700
          },
          {
            "parallel": [
              {
                "actor": "a",
                "to": [
                  0.4
                ],
                "ms": 900
              },
              {
                "actor": "b",
                "to": [
                  0.6
                ],
                "ms": 900
              }
            ]
          },
          {
            "actor": "b",
            "say": "so-fun",
            "text": "This is so fun!"
          },
          {
            "parallel": [
              {
                "actor": "a",
                "clip": "cheer"
              },
              {
                "actor": "b",
                "clip": "cheer"
              }
            ]
          },
          {
            "fx": "burst",
            "at": "ball"
          },
          {
            "narrator": "big-ball-after-roll",
            "text": "Rolling it together, both friends get to play. Wonderful!"
          }
        ]
      },
      {
        "id": "let-turn",
        "kind": true,
        "card": {
          "art": "emoji:🙋",
          "alt": "give a turn"
        },
        "ask": {
          "narrator": "big-ball-ask-turn",
          "text": "Or could the friend have a turn with the ball?"
        },
        "preview": [
          {
            "actor": "b",
            "clip": "ask"
          },
          {
            "actor": "b",
            "say": "turn-please",
            "text": "May I have a turn, please?"
          },
          {
            "actor": "a",
            "clip": "nod"
          }
        ],
        "resolution": [
          {
            "actor": "b",
            "clip": "ask"
          },
          {
            "actor": "b",
            "say": "turn-please",
            "text": "May I have a turn, please?"
          },
          {
            "actor": "a",
            "clip": "nod"
          },
          {
            "actor": "a",
            "say": "sure-turn",
            "text": "Sure! You can have a turn!"
          },
          {
            "prop": "ball",
            "holder": "b"
          },
          {
            "actor": "b",
            "say": "thank-you",
            "text": "Thank you, friend!"
          },
          {
            "parallel": [
              {
                "actor": "a",
                "clip": "cheer"
              },
              {
                "actor": "b",
                "clip": "cheer"
              }
            ]
          },
          {
            "fx": "burst",
            "at": "ball"
          },
          {
            "narrator": "big-ball-after-turn",
            "text": "Sharing a turn made both friends happy. Great kindness!"
          }
        ]
      }
    ]
  },
  "slide": {
    "id": "slide",
    "backdrop": "playground",
    "props": {
      "slide": {
        "art": "./assets/props/slide.png",
        "color": "#d64a4a",
        "scale": 1,
        "fx": 0.85,
        "fy": 0.52
      }
    },
    "setup": [
      {
        "narrator": "slide-setup",
        "text": "Two friends run to the slide. They both want to go first!"
      },
      {
        "actor": "a",
        "enter": "left",
        "to": [
          0.3
        ],
        "ms": 1800
      },
      {
        "actor": "b",
        "enter": "right",
        "to": [
          0.6
        ],
        "ms": 1800
      },
      {
        "actor": "a",
        "say": "me-first",
        "text": "I want to go first!"
      },
      {
        "actor": "b",
        "say": "me-too-first",
        "text": "But I want to be first too!"
      },
      {
        "parallel": [
          {
            "actor": "a",
            "clip": "stomp",
            "pose": {
              "$spine": {
                "bend": -0.06
              }
            }
          },
          {
            "actor": "b",
            "clip": "stomp",
            "pose": {
              "$spine": {
                "bend": 0.06
              }
            }
          }
        ]
      },
      {
        "narrator": "slide-problem",
        "text": "Uh oh! Both friends want to be first."
      },
      {
        "parallel": [
          {
            "actor": "a",
            "clip": "think"
          },
          {
            "actor": "b",
            "clip": "sad"
          }
        ]
      }
    ],
    "choices": [
      {
        "id": "push",
        "kind": false,
        "card": {
          "art": "emoji:😾",
          "alt": "push past"
        },
        "ask": {
          "narrator": "slide-ask-push",
          "text": "Should one friend push past to go first?"
        },
        "preview": [
          {
            "actor": "a",
            "clip": "stomp"
          },
          {
            "actor": "a",
            "say": "move-it",
            "text": "Move! I'm going first!"
          },
          {
            "actor": "b",
            "clip": "sad"
          },
          {
            "fx": "sad-puff",
            "at": "b"
          }
        ],
        "resolution": [
          {
            "actor": "a",
            "clip": "stomp"
          },
          {
            "actor": "a",
            "say": "move-it",
            "text": "Move! I'm going first!"
          },
          {
            "actor": "a",
            "to": [
              0.78
            ],
            "ms": 900
          },
          {
            "actor": "b",
            "clip": "sad"
          },
          {
            "fx": "sad-puff",
            "at": "b"
          },
          {
            "actor": "b",
            "say": "not-fair",
            "text": "Hey! That's not fair!"
          },
          {
            "narrator": "slide-after-push",
            "text": "Oh no. Pushing wasn't kind."
          }
        ]
      },
      {
        "id": "you-first",
        "kind": true,
        "card": {
          "art": "emoji:🙌",
          "alt": "you go first"
        },
        "ask": {
          "narrator": "slide-ask-youfirst",
          "text": "Should one friend let their friend go first?"
        },
        "preview": [
          {
            "actor": "a",
            "clip": "offer"
          },
          {
            "actor": "a",
            "say": "you-first",
            "text": "You can go first. Then it's my turn!"
          },
          {
            "actor": "b",
            "clip": "nod"
          }
        ],
        "resolution": [
          {
            "actor": "a",
            "clip": "offer"
          },
          {
            "actor": "a",
            "say": "you-first",
            "text": "You can go first. Then it's my turn!"
          },
          {
            "actor": "b",
            "clip": "nod"
          },
          {
            "actor": "b",
            "say": "thank-you",
            "text": "Thank you, friend!"
          },
          {
            "actor": "b",
            "to": [
              0.82
            ],
            "ms": 900
          },
          {
            "actor": "a",
            "to": [
              0.72
            ],
            "ms": 900
          },
          {
            "parallel": [
              {
                "actor": "a",
                "clip": "cheer"
              },
              {
                "actor": "b",
                "clip": "cheer"
              }
            ]
          },
          {
            "fx": "burst",
            "at": "a"
          },
          {
            "narrator": "slide-after-youfirst",
            "text": "Taking turns going first made both friends happy!"
          }
        ]
      },
      {
        "id": "count",
        "kind": true,
        "card": {
          "art": "emoji:🔢",
          "alt": "take turns"
        },
        "ask": {
          "narrator": "slide-ask-count",
          "text": "Or could they take turns, one then the other?"
        },
        "preview": [
          {
            "actor": "a",
            "say": "take-turns-idea",
            "text": "Let's take turns! You, then me!"
          },
          {
            "actor": "b",
            "clip": "nod"
          },
          {
            "actor": "b",
            "say": "good-idea",
            "text": "That's a good idea!"
          }
        ],
        "resolution": [
          {
            "actor": "a",
            "say": "take-turns-idea",
            "text": "Let's take turns! You, then me!"
          },
          {
            "actor": "b",
            "clip": "nod"
          },
          {
            "actor": "b",
            "say": "good-idea",
            "text": "That's a good idea!"
          },
          {
            "actor": "b",
            "to": [
              0.82
            ],
            "ms": 900
          },
          {
            "actor": "b",
            "clip": "cheer"
          },
          {
            "actor": "a",
            "to": [
              0.72
            ],
            "ms": 900
          },
          {
            "parallel": [
              {
                "actor": "a",
                "clip": "cheer"
              },
              {
                "actor": "b",
                "clip": "cheer"
              }
            ]
          },
          {
            "fx": "sparkle",
            "at": "slide"
          },
          {
            "narrator": "slide-after-count",
            "text": "Taking turns means everyone gets a turn. Well done!"
          }
        ]
      }
    ]
  },
  "swing": {
    "id": "swing",
    "backdrop": "playground",
    "props": {
      "swing": {
        "art": "./assets/props/swing.png",
        "color": "#4a8b6a",
        "scale": 1,
        "fx": 0.28,
        "fy": 0.5
      }
    },
    "setup": [
      {
        "narrator": "swing-setup",
        "text": "One friend has been swinging for a long, long time."
      },
      {
        "actor": "a",
        "say": "so-fun",
        "text": "This is so fun!"
      },
      {
        "actor": "b",
        "enter": "right",
        "to": [
          0.65
        ],
        "ms": 1800
      },
      {
        "actor": "b",
        "say": "turn-please",
        "text": "May I have a turn, please?"
      },
      {
        "actor": "a",
        "clip": "head-shake"
      },
      {
        "narrator": "swing-problem",
        "text": "Their friend is still waiting for a turn to swing."
      },
      {
        "parallel": [
          {
            "actor": "a",
            "clip": "idle"
          },
          {
            "actor": "b",
            "clip": "sad"
          }
        ]
      }
    ],
    "choices": [
      {
        "id": "ignore",
        "kind": false,
        "card": {
          "art": "emoji:🙈",
          "alt": "ignore friend"
        },
        "ask": {
          "narrator": "swing-ask-ignore",
          "text": "Should the friend keep swinging and not share?"
        },
        "preview": [
          {
            "actor": "a",
            "clip": "head-shake"
          },
          {
            "actor": "a",
            "clip": "idle"
          },
          {
            "actor": "b",
            "clip": "sad"
          },
          {
            "fx": "sad-puff",
            "at": "b"
          }
        ],
        "resolution": [
          {
            "actor": "a",
            "clip": "head-shake"
          },
          {
            "actor": "a",
            "clip": "idle"
          },
          {
            "actor": "b",
            "clip": "sad"
          },
          {
            "fx": "sad-puff",
            "at": "b"
          },
          {
            "actor": "b",
            "say": "im-sad",
            "text": "That makes me feel sad."
          },
          {
            "narrator": "swing-after-ignore",
            "text": "Waiting so long felt sad."
          }
        ]
      },
      {
        "id": "offer",
        "kind": true,
        "card": {
          "art": "emoji:🤗",
          "alt": "offer a turn"
        },
        "ask": {
          "narrator": "swing-ask-offer",
          "text": "Should the friend hop off and offer a turn?"
        },
        "preview": [
          {
            "actor": "a",
            "clip": "jump"
          },
          {
            "actor": "a",
            "clip": "offer"
          },
          {
            "actor": "a",
            "say": "sure-turn",
            "text": "Sure! You can have a turn!"
          }
        ],
        "resolution": [
          {
            "actor": "a",
            "clip": "jump"
          },
          {
            "actor": "a",
            "to": [
              0.42
            ],
            "ms": 900
          },
          {
            "actor": "a",
            "clip": "offer"
          },
          {
            "actor": "a",
            "say": "sure-turn",
            "text": "Sure! You can have a turn!"
          },
          {
            "actor": "b",
            "to": [
              0.3
            ],
            "ms": 900
          },
          {
            "actor": "b",
            "say": "thank-you",
            "text": "Thank you, friend!"
          },
          {
            "actor": "b",
            "clip": "cheer"
          },
          {
            "fx": "burst",
            "at": "b"
          },
          {
            "narrator": "swing-after-offer",
            "text": "Hopping off to share made both friends happy!"
          }
        ]
      },
      {
        "id": "turns",
        "kind": true,
        "card": {
          "art": "emoji:🔁",
          "alt": "take turns"
        },
        "ask": {
          "narrator": "swing-ask-turns",
          "text": "Or could they take turns on the swing?"
        },
        "preview": [
          {
            "actor": "a",
            "say": "take-turns-idea",
            "text": "Let's take turns! You, then me!"
          },
          {
            "actor": "b",
            "clip": "nod"
          },
          {
            "actor": "b",
            "say": "good-idea",
            "text": "That's a good idea!"
          }
        ],
        "resolution": [
          {
            "actor": "a",
            "say": "take-turns-idea",
            "text": "Let's take turns! You, then me!"
          },
          {
            "actor": "a",
            "clip": "jump"
          },
          {
            "actor": "a",
            "to": [
              0.4
            ],
            "ms": 900
          },
          {
            "actor": "b",
            "to": [
              0.3
            ],
            "ms": 900
          },
          {
            "actor": "b",
            "clip": "cheer"
          },
          {
            "actor": "b",
            "say": "so-fun",
            "text": "This is so fun!"
          },
          {
            "parallel": [
              {
                "actor": "a",
                "clip": "cheer"
              },
              {
                "actor": "b",
                "clip": "cheer"
              }
            ]
          },
          {
            "fx": "burst",
            "at": "swing"
          },
          {
            "narrator": "swing-after-turns",
            "text": "Taking turns means everyone gets to swing. Wonderful!"
          }
        ]
      }
    ]
  },
  "drum": {
    "id": "drum",
    "backdrop": "playroom",
    "props": {
      "drum": {
        "art": "./assets/props/drum.png",
        "color": "#d6a44a",
        "scale": 0.35,
        "holder": "a",
        "handBone": "arm-lower.R",
        "handOffset": [
          0,
          110
        ]
      }
    },
    "setup": [
      {
        "narrator": "drum-setup",
        "text": "One puppet is banging the toy drum. Here comes their friend!"
      },
      {
        "actor": "b",
        "enter": "right",
        "to": [
          0.7
        ],
        "ms": 1800
      },
      {
        "actor": "b",
        "say": "want-it",
        "text": "Ooh! I want to play with that too!"
      },
      {
        "actor": "a",
        "say": "had-it-first",
        "text": "But I had it first!"
      },
      {
        "parallel": [
          {
            "actor": "a",
            "clip": "stomp",
            "pose": {
              "$spine": {
                "bend": -0.06
              }
            }
          },
          {
            "actor": "b",
            "clip": "sad",
            "pose": {
              "head": {
                "rotation": 0.2
              }
            }
          }
        ]
      },
      {
        "narrator": "drum-problem",
        "text": "Uh oh! Both friends want to play the drum."
      },
      {
        "actor": "a",
        "clip": "think"
      }
    ],
    "choices": [
      {
        "id": "grab",
        "kind": false,
        "card": {
          "art": "emoji:😾",
          "alt": "grab it away"
        },
        "ask": {
          "narrator": "drum-ask-grab",
          "text": "Should the friend grab the drumsticks away?"
        },
        "preview": [
          {
            "actor": "b",
            "clip": "grab"
          },
          {
            "prop": "drum",
            "holder": "b"
          },
          {
            "actor": "a",
            "clip": "sad"
          },
          {
            "fx": "sad-puff",
            "at": "a"
          }
        ],
        "resolution": [
          {
            "actor": "b",
            "clip": "grab"
          },
          {
            "prop": "drum",
            "holder": "b"
          },
          {
            "actor": "b",
            "say": "mine-no",
            "text": "No! It's mine!"
          },
          {
            "actor": "a",
            "clip": "sad"
          },
          {
            "fx": "sad-puff",
            "at": "a"
          },
          {
            "actor": "a",
            "say": "im-sad",
            "text": "That makes me feel sad."
          },
          {
            "narrator": "drum-after-grab",
            "text": "Oh no. Grabbing made their friend feel sad."
          }
        ]
      },
      {
        "id": "turns",
        "kind": true,
        "card": {
          "art": "emoji:🥁",
          "alt": "take turns"
        },
        "ask": {
          "narrator": "drum-ask-turns",
          "text": "Should the friends take turns drumming?"
        },
        "preview": [
          {
            "actor": "a",
            "say": "take-turns-idea",
            "text": "Let's take turns! You, then me!"
          },
          {
            "actor": "b",
            "clip": "nod"
          },
          {
            "actor": "b",
            "say": "good-idea",
            "text": "That's a good idea!"
          }
        ],
        "resolution": [
          {
            "actor": "a",
            "say": "take-turns-idea",
            "text": "Let's take turns! You, then me!"
          },
          {
            "actor": "a",
            "clip": "cheer"
          },
          {
            "prop": "drum",
            "holder": "b"
          },
          {
            "actor": "b",
            "say": "so-fun",
            "text": "This is so fun!"
          },
          {
            "parallel": [
              {
                "actor": "a",
                "clip": "cheer"
              },
              {
                "actor": "b",
                "clip": "cheer"
              }
            ]
          },
          {
            "fx": "burst",
            "at": "drum"
          },
          {
            "narrator": "drum-after-turns",
            "text": "Taking turns means everyone gets to drum. Well done!"
          }
        ]
      },
      {
        "id": "together",
        "kind": true,
        "card": {
          "art": "emoji:🎵",
          "alt": "drum together"
        },
        "ask": {
          "narrator": "drum-ask-together",
          "text": "Or could they play together, one taps and one claps?"
        },
        "preview": [
          {
            "actor": "a",
            "clip": "offer"
          },
          {
            "actor": "a",
            "say": "lets-share",
            "text": "Let's play with it together!"
          },
          {
            "actor": "b",
            "clip": "nod"
          }
        ],
        "resolution": [
          {
            "actor": "a",
            "clip": "offer"
          },
          {
            "actor": "a",
            "say": "lets-share",
            "text": "Let's play with it together!"
          },
          {
            "actor": "b",
            "say": "good-idea",
            "text": "That's a good idea!"
          },
          {
            "parallel": [
              {
                "actor": "a",
                "clip": "cheer"
              },
              {
                "actor": "b",
                "clip": "jump"
              }
            ]
          },
          {
            "actor": "b",
            "say": "so-fun",
            "text": "This is so fun!"
          },
          {
            "parallel": [
              {
                "actor": "a",
                "clip": "cheer"
              },
              {
                "actor": "b",
                "clip": "cheer"
              }
            ]
          },
          {
            "fx": "burst",
            "at": "drum"
          },
          {
            "narrator": "drum-after-together",
            "text": "Playing together, everyone makes music. Wonderful!"
          }
        ]
      }
    ]
  },
  "telescope": {
    "id": "telescope",
    "backdrop": "playroom",
    "props": {
      "telescope": {
        "art": "./assets/props/telescope.png",
        "color": "#4a6fa8",
        "scale": 0.3,
        "holder": "a",
        "handBone": "arm-lower.R",
        "handOffset": [
          0,
          110
        ]
      }
    },
    "setup": [
      {
        "narrator": "telescope-setup",
        "text": "One puppet is looking through the telescope. Here comes their friend!"
      },
      {
        "actor": "b",
        "enter": "right",
        "to": [
          0.7
        ],
        "ms": 1800
      },
      {
        "actor": "a",
        "say": "look-at-this",
        "text": "Wow! Look at this!"
      },
      {
        "actor": "b",
        "say": "turn-please",
        "text": "May I have a turn, please?"
      },
      {
        "actor": "a",
        "clip": "head-shake"
      },
      {
        "actor": "a",
        "say": "mine-no",
        "text": "No! It's mine!"
      },
      {
        "narrator": "telescope-problem",
        "text": "Oh no. Their friend wants a turn to look too."
      },
      {
        "parallel": [
          {
            "actor": "a",
            "clip": "think"
          },
          {
            "actor": "b",
            "clip": "sad"
          }
        ]
      }
    ],
    "choices": [
      {
        "id": "keep",
        "kind": false,
        "card": {
          "art": "emoji:🙈",
          "alt": "keep it"
        },
        "ask": {
          "narrator": "telescope-ask-keep",
          "text": "Should the friend keep looking and say it's mine?"
        },
        "preview": [
          {
            "actor": "a",
            "clip": "head-shake"
          },
          {
            "actor": "a",
            "say": "mine-no",
            "text": "No! It's mine!"
          },
          {
            "actor": "b",
            "clip": "sad"
          },
          {
            "fx": "sad-puff",
            "at": "b"
          }
        ],
        "resolution": [
          {
            "actor": "a",
            "clip": "head-shake"
          },
          {
            "actor": "a",
            "say": "mine-no",
            "text": "No! It's mine!"
          },
          {
            "actor": "b",
            "clip": "sad"
          },
          {
            "fx": "sad-puff",
            "at": "b"
          },
          {
            "actor": "b",
            "say": "not-fair",
            "text": "Hey! That's not fair!"
          },
          {
            "narrator": "telescope-after-keep",
            "text": "Keeping it all felt unfair."
          }
        ]
      },
      {
        "id": "your-turn",
        "kind": true,
        "card": {
          "art": "emoji:🔭",
          "alt": "your turn now"
        },
        "ask": {
          "narrator": "telescope-ask-yourturn",
          "text": "Should the friend say your turn now?"
        },
        "preview": [
          {
            "actor": "a",
            "clip": "offer"
          },
          {
            "actor": "a",
            "say": "your-turn-now",
            "text": "Your turn now!"
          },
          {
            "actor": "b",
            "clip": "nod"
          }
        ],
        "resolution": [
          {
            "actor": "a",
            "clip": "offer"
          },
          {
            "actor": "a",
            "say": "your-turn-now",
            "text": "Your turn now!"
          },
          {
            "prop": "telescope",
            "holder": "b"
          },
          {
            "actor": "b",
            "say": "thank-you",
            "text": "Thank you, friend!"
          },
          {
            "actor": "b",
            "clip": "cheer"
          },
          {
            "actor": "b",
            "say": "look-at-this",
            "text": "Wow! Look at this!"
          },
          {
            "parallel": [
              {
                "actor": "a",
                "clip": "cheer"
              },
              {
                "actor": "b",
                "clip": "cheer"
              }
            ]
          },
          {
            "fx": "burst",
            "at": "telescope"
          },
          {
            "narrator": "telescope-after-yourturn",
            "text": "Giving a turn made both friends happy!"
          }
        ]
      },
      {
        "id": "turns",
        "kind": true,
        "card": {
          "art": "emoji:🗣️",
          "alt": "take turns"
        },
        "ask": {
          "narrator": "telescope-ask-turns",
          "text": "Or could they take turns looking and telling what they see?"
        },
        "preview": [
          {
            "actor": "a",
            "say": "take-turns-idea",
            "text": "Let's take turns! You, then me!"
          },
          {
            "actor": "b",
            "clip": "nod"
          },
          {
            "actor": "b",
            "say": "good-idea",
            "text": "That's a good idea!"
          }
        ],
        "resolution": [
          {
            "actor": "a",
            "say": "take-turns-idea",
            "text": "Let's take turns! You, then me!"
          },
          {
            "actor": "a",
            "say": "look-at-this",
            "text": "Wow! Look at this!"
          },
          {
            "prop": "telescope",
            "holder": "b"
          },
          {
            "actor": "b",
            "say": "look-at-this",
            "text": "Wow! Look at this!"
          },
          {
            "parallel": [
              {
                "actor": "a",
                "clip": "cheer"
              },
              {
                "actor": "b",
                "clip": "cheer"
              }
            ]
          },
          {
            "fx": "burst",
            "at": "telescope"
          },
          {
            "narrator": "telescope-after-turns",
            "text": "Taking turns, both friends get to look and share. Wonderful!"
          }
        ]
      }
    ]
  },
  "high-shelf": {
    "id": "high-shelf",
    "backdrop": "playroom",
    "props": {
      "shelf": {
        "art": "./assets/props/shelf-tall.png",
        "color": "#a8763e",
        "scale": 1,
        "fx": 0.85,
        "fy": 0.5
      },
      "ball": {
        "art": "./assets/props/ball.png",
        "color": "#e0563a",
        "scale": 0.28,
        "fx": 0.82,
        "fy": 0.18
      }
    },
    "setup": [
      {
        "narrator": "high-shelf-setup",
        "text": "One puppet wants the ball on top of the tall shelf."
      },
      {
        "actor": "a",
        "enter": "left",
        "to": [
          0.65
        ],
        "ms": 1800
      },
      {
        "actor": "a",
        "clip": "jump"
      },
      {
        "actor": "a",
        "say": "too-high",
        "text": "Oh no, it's too high! I can't reach it."
      },
      {
        "actor": "a",
        "clip": "jump"
      },
      {
        "narrator": "high-shelf-problem",
        "text": "The ball is too high. One puppet cannot reach it alone."
      },
      {
        "actor": "a",
        "clip": "sad"
      }
    ],
    "choices": [
      {
        "id": "jump-alone",
        "kind": false,
        "card": {
          "art": "emoji:😣",
          "alt": "keep jumping alone"
        },
        "ask": {
          "narrator": "high-shelf-ask-jump",
          "text": "Should one puppet keep jumping all alone?"
        },
        "preview": [
          {
            "actor": "a",
            "clip": "jump"
          },
          {
            "actor": "a",
            "clip": "jump"
          },
          {
            "actor": "a",
            "clip": "sad"
          },
          {
            "fx": "sad-puff",
            "at": "a"
          }
        ],
        "resolution": [
          {
            "actor": "a",
            "clip": "jump"
          },
          {
            "actor": "a",
            "clip": "jump"
          },
          {
            "actor": "a",
            "clip": "sad"
          },
          {
            "fx": "sad-puff",
            "at": "a"
          },
          {
            "actor": "a",
            "say": "im-sad",
            "text": "That makes me feel sad."
          },
          {
            "narrator": "high-shelf-after-jump",
            "text": "Trying alone again and again is so tiring."
          }
        ]
      },
      {
        "id": "ask-help",
        "kind": true,
        "card": {
          "art": "emoji:🙋",
          "alt": "ask friend for help"
        },
        "ask": {
          "narrator": "high-shelf-ask-help",
          "text": "Should one puppet ask their friend to help?"
        },
        "preview": [
          {
            "actor": "b",
            "enter": "right",
            "to": [
              0.6
            ],
            "ms": 1800
          },
          {
            "actor": "a",
            "clip": "ask"
          },
          {
            "actor": "a",
            "say": "help-please",
            "text": "Can you help me, please?"
          },
          {
            "actor": "b",
            "clip": "nod"
          }
        ],
        "resolution": [
          {
            "actor": "b",
            "enter": "right",
            "to": [
              0.6
            ],
            "ms": 1800
          },
          {
            "actor": "a",
            "clip": "ask"
          },
          {
            "actor": "a",
            "say": "help-please",
            "text": "Can you help me, please?"
          },
          {
            "actor": "b",
            "say": "ill-help",
            "text": "Of course! I'll help you!"
          },
          {
            "actor": "b",
            "clip": "grab"
          },
          {
            "prop": "ball",
            "holder": "a"
          },
          {
            "actor": "a",
            "say": "thank-you",
            "text": "Thank you, friend!"
          },
          {
            "fx": "burst",
            "at": "ball"
          },
          {
            "narrator": "high-shelf-after-help",
            "text": "Asking for help worked! Now both friends can play."
          }
        ]
      },
      {
        "id": "give-up",
        "kind": false,
        "card": {
          "art": "emoji:😢",
          "alt": "give up sadly"
        },
        "ask": {
          "narrator": "high-shelf-ask-giveup",
          "text": "Should one puppet give up and feel sad?"
        },
        "preview": [
          {
            "actor": "a",
            "clip": "head-shake"
          },
          {
            "actor": "a",
            "clip": "sad"
          },
          {
            "fx": "sad-puff",
            "at": "a"
          }
        ],
        "resolution": [
          {
            "actor": "a",
            "clip": "head-shake"
          },
          {
            "actor": "a",
            "say": "cant-do-it",
            "text": "I can't do it all by myself."
          },
          {
            "actor": "a",
            "clip": "sad"
          },
          {
            "fx": "sad-puff",
            "at": "a"
          },
          {
            "actor": "a",
            "say": "im-sad",
            "text": "That makes me feel sad."
          },
          {
            "narrator": "high-shelf-after-giveup",
            "text": "Giving up feels sad."
          }
        ]
      }
    ]
  },
  "spilled-blocks": {
    "id": "spilled-blocks",
    "backdrop": "playroom",
    "props": {
      "blocks": {
        "art": "./assets/props/blocks-spilled.png",
        "color": "#58a945",
        "scale": 0.5,
        "fx": 0.5,
        "fy": 0.85
      }
    },
    "setup": [
      {
        "narrator": "spilled-blocks-setup",
        "text": "One puppet is playing with a big pile of blocks."
      },
      {
        "actor": "a",
        "enter": "left",
        "to": [
          0.5
        ],
        "ms": 1800
      },
      {
        "actor": "a",
        "clip": "grab"
      },
      {
        "actor": "a",
        "say": "uh-oh",
        "text": "Uh oh!"
      },
      {
        "narrator": "spilled-blocks-problem",
        "text": "Oh no! The blocks spilled everywhere. What a big mess."
      },
      {
        "actor": "a",
        "clip": "sad"
      }
    ],
    "choices": [
      {
        "id": "run-away",
        "kind": false,
        "card": {
          "art": "emoji:🏃",
          "alt": "run from the mess"
        },
        "ask": {
          "narrator": "spilled-blocks-ask-run",
          "text": "Should one puppet run away from the big mess?"
        },
        "preview": [
          {
            "actor": "a",
            "clip": "walk"
          },
          {
            "actor": "a",
            "to": [
              0.05
            ],
            "ms": 900
          },
          {
            "actor": "a",
            "clip": "sad"
          },
          {
            "fx": "sad-puff",
            "at": "a"
          }
        ],
        "resolution": [
          {
            "actor": "a",
            "clip": "walk"
          },
          {
            "actor": "a",
            "to": [
              0.05
            ],
            "ms": 900
          },
          {
            "actor": "a",
            "clip": "sad"
          },
          {
            "fx": "sad-puff",
            "at": "a"
          },
          {
            "actor": "a",
            "say": "im-sad",
            "text": "That makes me feel sad."
          },
          {
            "narrator": "spilled-blocks-after-run",
            "text": "Running away leaves the mess and feels sad."
          }
        ]
      },
      {
        "id": "ask-help",
        "kind": true,
        "card": {
          "art": "emoji:🙋",
          "alt": "ask friend to help"
        },
        "ask": {
          "narrator": "spilled-blocks-ask-help",
          "text": "Should one puppet ask their friend to help clean up?"
        },
        "preview": [
          {
            "actor": "b",
            "enter": "right",
            "to": [
              0.6
            ],
            "ms": 1800
          },
          {
            "actor": "a",
            "clip": "ask"
          },
          {
            "actor": "a",
            "say": "help-please",
            "text": "Can you help me, please?"
          },
          {
            "actor": "b",
            "clip": "nod"
          }
        ],
        "resolution": [
          {
            "actor": "b",
            "enter": "right",
            "to": [
              0.6
            ],
            "ms": 1800
          },
          {
            "actor": "a",
            "clip": "ask"
          },
          {
            "actor": "a",
            "say": "help-please",
            "text": "Can you help me, please?"
          },
          {
            "actor": "b",
            "say": "ill-help",
            "text": "Of course! I'll help you!"
          },
          {
            "parallel": [
              {
                "actor": "a",
                "to": [
                  0.4
                ],
                "ms": 900
              },
              {
                "actor": "b",
                "to": [
                  0.6
                ],
                "ms": 900
              }
            ]
          },
          {
            "parallel": [
              {
                "actor": "a",
                "clip": "grab"
              },
              {
                "actor": "b",
                "clip": "grab"
              }
            ]
          },
          {
            "prop": "blocks",
            "holder": "a"
          },
          {
            "fx": "burst",
            "at": "blocks"
          },
          {
            "narrator": "spilled-blocks-after-help",
            "text": "Asking for help made cleaning quick and happy!"
          }
        ]
      },
      {
        "id": "clean-together",
        "kind": true,
        "card": {
          "art": "emoji:🤝",
          "alt": "clean up together"
        },
        "ask": {
          "narrator": "spilled-blocks-ask-together",
          "text": "Or could a friend offer to help clean together?"
        },
        "preview": [
          {
            "actor": "b",
            "enter": "right",
            "to": [
              0.6
            ],
            "ms": 1800
          },
          {
            "actor": "b",
            "clip": "offer"
          },
          {
            "parallel": [
              {
                "actor": "a",
                "clip": "nod"
              },
              {
                "actor": "b",
                "clip": "nod"
              }
            ]
          }
        ],
        "resolution": [
          {
            "actor": "b",
            "enter": "right",
            "to": [
              0.6
            ],
            "ms": 1800
          },
          {
            "actor": "b",
            "clip": "offer"
          },
          {
            "actor": "b",
            "say": "ill-help",
            "text": "Of course! I'll help you!"
          },
          {
            "parallel": [
              {
                "actor": "a",
                "to": [
                  0.4
                ],
                "ms": 900
              },
              {
                "actor": "b",
                "to": [
                  0.6
                ],
                "ms": 900
              }
            ]
          },
          {
            "parallel": [
              {
                "actor": "a",
                "clip": "grab"
              },
              {
                "actor": "b",
                "clip": "grab"
              }
            ]
          },
          {
            "prop": "blocks",
            "holder": "b"
          },
          {
            "actor": "a",
            "say": "we-did-it",
            "text": "We did it together!"
          },
          {
            "fx": "burst",
            "at": "blocks"
          },
          {
            "narrator": "spilled-blocks-after-together",
            "text": "Cleaning up together is fast and fun. Wonderful teamwork!"
          }
        ]
      }
    ]
  },
  "stuck-wagon": {
    "id": "stuck-wagon",
    "backdrop": "playground",
    "props": {
      "wagon": {
        "art": "./assets/props/wagon.png",
        "color": "#c43a2e",
        "scale": 0.42,
        "fx": 0.5,
        "fy": 0.8
      }
    },
    "setup": [
      {
        "narrator": "stuck-wagon-setup",
        "text": "One puppet wants to pull the little red wagon."
      },
      {
        "actor": "a",
        "enter": "left",
        "to": [
          0.4
        ],
        "ms": 1800
      },
      {
        "actor": "a",
        "clip": "grab"
      },
      {
        "actor": "a",
        "say": "cant-do-it",
        "text": "I can't do it all by myself."
      },
      {
        "narrator": "stuck-wagon-problem",
        "text": "The wagon is stuck! One puppet cannot pull it alone."
      },
      {
        "actor": "a",
        "clip": "sad"
      }
    ],
    "choices": [
      {
        "id": "yank-stomp",
        "kind": false,
        "card": {
          "art": "emoji:😤",
          "alt": "yank and stomp"
        },
        "ask": {
          "narrator": "stuck-wagon-ask-yank",
          "text": "Should one puppet yank hard and stomp all alone?"
        },
        "preview": [
          {
            "actor": "a",
            "clip": "grab"
          },
          {
            "actor": "a",
            "clip": "stomp"
          },
          {
            "actor": "a",
            "clip": "sad"
          },
          {
            "fx": "sad-puff",
            "at": "a"
          }
        ],
        "resolution": [
          {
            "actor": "a",
            "clip": "grab"
          },
          {
            "actor": "a",
            "clip": "stomp"
          },
          {
            "actor": "a",
            "say": "not-fair",
            "text": "Hey! That's not fair!"
          },
          {
            "actor": "a",
            "clip": "sad"
          },
          {
            "fx": "sad-puff",
            "at": "a"
          },
          {
            "actor": "a",
            "say": "im-sad",
            "text": "That makes me feel sad."
          },
          {
            "narrator": "stuck-wagon-after-yank",
            "text": "Yanking and stomping is tiring and sad."
          }
        ]
      },
      {
        "id": "ask-help",
        "kind": true,
        "card": {
          "art": "emoji:🙋",
          "alt": "ask friend for help"
        },
        "ask": {
          "narrator": "stuck-wagon-ask-help",
          "text": "Should one puppet ask their friend for help?"
        },
        "preview": [
          {
            "actor": "b",
            "enter": "right",
            "to": [
              0.6
            ],
            "ms": 1800
          },
          {
            "actor": "a",
            "clip": "ask"
          },
          {
            "actor": "a",
            "say": "help-please",
            "text": "Can you help me, please?"
          },
          {
            "actor": "b",
            "clip": "nod"
          }
        ],
        "resolution": [
          {
            "actor": "b",
            "enter": "right",
            "to": [
              0.6
            ],
            "ms": 1800
          },
          {
            "actor": "a",
            "clip": "ask"
          },
          {
            "actor": "a",
            "say": "help-please",
            "text": "Can you help me, please?"
          },
          {
            "actor": "b",
            "say": "ill-help",
            "text": "Of course! I'll help you!"
          },
          {
            "parallel": [
              {
                "actor": "a",
                "to": [
                  0.4
                ],
                "ms": 900
              },
              {
                "actor": "b",
                "to": [
                  0.6
                ],
                "ms": 900
              }
            ]
          },
          {
            "parallel": [
              {
                "actor": "a",
                "clip": "grab"
              },
              {
                "actor": "b",
                "clip": "grab"
              }
            ]
          },
          {
            "prop": "wagon",
            "to": [
              0.7,
              "floor"
            ],
            "ms": 700
          },
          {
            "fx": "burst",
            "at": "wagon"
          },
          {
            "narrator": "stuck-wagon-after-help",
            "text": "Asking for help got the wagon moving. Hooray!"
          }
        ]
      },
      {
        "id": "pull-together",
        "kind": true,
        "card": {
          "art": "emoji:🤝",
          "alt": "pull it together"
        },
        "ask": {
          "narrator": "stuck-wagon-ask-together",
          "text": "Or could both friends push and pull together?"
        },
        "preview": [
          {
            "actor": "b",
            "enter": "right",
            "to": [
              0.6
            ],
            "ms": 1800
          },
          {
            "actor": "b",
            "clip": "offer"
          },
          {
            "parallel": [
              {
                "actor": "a",
                "clip": "nod"
              },
              {
                "actor": "b",
                "clip": "nod"
              }
            ]
          }
        ],
        "resolution": [
          {
            "actor": "b",
            "enter": "right",
            "to": [
              0.6
            ],
            "ms": 1800
          },
          {
            "actor": "b",
            "clip": "offer"
          },
          {
            "actor": "b",
            "say": "ill-help",
            "text": "Of course! I'll help you!"
          },
          {
            "parallel": [
              {
                "actor": "a",
                "to": [
                  0.4
                ],
                "ms": 900
              },
              {
                "actor": "b",
                "to": [
                  0.6
                ],
                "ms": 900
              }
            ]
          },
          {
            "parallel": [
              {
                "actor": "a",
                "clip": "grab"
              },
              {
                "actor": "b",
                "clip": "grab"
              }
            ]
          },
          {
            "prop": "wagon",
            "to": [
              0.75,
              "floor"
            ],
            "ms": 700
          },
          {
            "actor": "a",
            "say": "we-did-it",
            "text": "We did it together!"
          },
          {
            "fx": "burst",
            "at": "wagon"
          },
          {
            "narrator": "stuck-wagon-after-together",
            "text": "Pushing and pulling together, the wagon rolls! Great teamwork!"
          }
        ]
      }
    ]
  },
  "tangled-kite": {
    "id": "tangled-kite",
    "backdrop": "playground",
    "props": {
      "kite": {
        "art": "./assets/props/kite-tangled.png",
        "color": "#8a5bc4",
        "scale": 0.38,
        "holder": "a",
        "handBone": "arm-lower.R",
        "handOffset": [
          0,
          110
        ]
      }
    },
    "setup": [
      {
        "narrator": "tangled-kite-setup",
        "text": "One puppet has a kite, but the string is all tangled."
      },
      {
        "actor": "a",
        "enter": "left",
        "to": [
          0.4
        ],
        "ms": 1800
      },
      {
        "actor": "a",
        "clip": "think"
      },
      {
        "actor": "a",
        "say": "uh-oh",
        "text": "Uh oh!"
      },
      {
        "narrator": "tangled-kite-problem",
        "text": "What a big tangle! One puppet cannot fix it alone."
      },
      {
        "actor": "a",
        "clip": "sad"
      }
    ],
    "choices": [
      {
        "id": "pull-hard",
        "kind": false,
        "card": {
          "art": "emoji:😬",
          "alt": "pull it harder"
        },
        "ask": {
          "narrator": "tangled-kite-ask-pull",
          "text": "Should one puppet pull the string harder all alone?"
        },
        "preview": [
          {
            "actor": "a",
            "clip": "grab"
          },
          {
            "actor": "a",
            "say": "uh-oh",
            "text": "Uh oh!"
          },
          {
            "actor": "a",
            "clip": "sad"
          },
          {
            "fx": "sad-puff",
            "at": "a"
          }
        ],
        "resolution": [
          {
            "actor": "a",
            "clip": "grab"
          },
          {
            "actor": "a",
            "say": "uh-oh",
            "text": "Uh oh!"
          },
          {
            "actor": "a",
            "clip": "sad"
          },
          {
            "fx": "sad-puff",
            "at": "a"
          },
          {
            "actor": "a",
            "say": "im-sad",
            "text": "That makes me feel sad."
          },
          {
            "narrator": "tangled-kite-after-pull",
            "text": "Pulling hard made the tangle worse."
          }
        ]
      },
      {
        "id": "ask-help",
        "kind": true,
        "card": {
          "art": "emoji:🙋",
          "alt": "ask friend to help"
        },
        "ask": {
          "narrator": "tangled-kite-ask-help",
          "text": "Should one puppet ask their friend to help untangle it?"
        },
        "preview": [
          {
            "actor": "b",
            "enter": "right",
            "to": [
              0.6
            ],
            "ms": 1800
          },
          {
            "actor": "a",
            "clip": "ask"
          },
          {
            "actor": "a",
            "say": "help-please",
            "text": "Can you help me, please?"
          },
          {
            "actor": "b",
            "clip": "nod"
          }
        ],
        "resolution": [
          {
            "actor": "b",
            "enter": "right",
            "to": [
              0.6
            ],
            "ms": 1800
          },
          {
            "actor": "a",
            "clip": "ask"
          },
          {
            "actor": "a",
            "say": "help-please",
            "text": "Can you help me, please?"
          },
          {
            "actor": "b",
            "say": "ill-help",
            "text": "Of course! I'll help you!"
          },
          {
            "parallel": [
              {
                "actor": "a",
                "to": [
                  0.4
                ],
                "ms": 900
              },
              {
                "actor": "b",
                "to": [
                  0.6
                ],
                "ms": 900
              }
            ]
          },
          {
            "parallel": [
              {
                "actor": "a",
                "clip": "grab"
              },
              {
                "actor": "b",
                "clip": "grab"
              }
            ]
          },
          {
            "prop": "kite",
            "holder": "a"
          },
          {
            "fx": "burst",
            "at": "kite"
          },
          {
            "narrator": "tangled-kite-after-help",
            "text": "Asking for help fixed the tangle. Now the kite can fly!"
          }
        ]
      },
      {
        "id": "work-together",
        "kind": true,
        "card": {
          "art": "emoji:🤝",
          "alt": "untangle together"
        },
        "ask": {
          "narrator": "tangled-kite-ask-together",
          "text": "Or could both friends work on it together, patiently?"
        },
        "preview": [
          {
            "actor": "b",
            "enter": "right",
            "to": [
              0.6
            ],
            "ms": 1800
          },
          {
            "parallel": [
              {
                "actor": "a",
                "clip": "think"
              },
              {
                "actor": "b",
                "clip": "think"
              }
            ]
          },
          {
            "actor": "b",
            "clip": "nod"
          }
        ],
        "resolution": [
          {
            "actor": "b",
            "enter": "right",
            "to": [
              0.6
            ],
            "ms": 1800
          },
          {
            "actor": "b",
            "clip": "offer"
          },
          {
            "actor": "b",
            "say": "ill-help",
            "text": "Of course! I'll help you!"
          },
          {
            "parallel": [
              {
                "actor": "a",
                "to": [
                  0.4
                ],
                "ms": 900
              },
              {
                "actor": "b",
                "to": [
                  0.6
                ],
                "ms": 900
              }
            ]
          },
          {
            "parallel": [
              {
                "actor": "a",
                "clip": "think"
              },
              {
                "actor": "b",
                "clip": "think"
              }
            ]
          },
          {
            "parallel": [
              {
                "actor": "a",
                "clip": "grab"
              },
              {
                "actor": "b",
                "clip": "grab"
              }
            ]
          },
          {
            "actor": "a",
            "say": "we-did-it",
            "text": "We did it together!"
          },
          {
            "fx": "burst",
            "at": "kite"
          },
          {
            "narrator": "tangled-kite-after-together",
            "text": "Working together patiently, the tangle is gone! Wonderful!"
          }
        ]
      }
    ]
  }
};

export default {
  id: 'puppet-problem-solvers',
  engine: 'puppet-theater',
  title: 'Problem-Solving Puppets',
  splashEmoji: '🎭',
  menu: {
    backdrop: './assets/ui/menu-classroom-gpt-image-2.png',
    prompt: 'Choose a story',
    helper: 'Pick a problem for the puppets to solve together!',
    mascots: ['fox', 'unicorn'],
  },
  cast: ['bear', 'doggy', 'fox', 'frog', 'rabbit', 'unicorn', 'princess-lily', 'princess-zoe'],
  backdrops: {
    playroom: './assets/bg/playroom.png',
    playground: './assets/bg/playground.png',
  },
  propPack: './assets/props/pack.json',
  scenePack: './scene-pack.json',
  judgeArt: {
    sad: './assets/ui/judge-sad.png',
    happy: './assets/ui/judge-happy.png',
  },
  copy: {
    home: 'Home',
    replay: 'Hear the choices again',
    playAgain: 'Play Again',
    castPrompt: 'Pick two puppets for the show!',
  },
  voice: {
    intro: 'The puppets have a problem! Watch what happens, then help them find a kind way.',
    castPrompt: 'Pick two puppets for the show!',
    watchWhat: 'Watch what they do!',
    judge: 'Did you like that choice? Tap the happy face or the sad face.',
    judgeNudge: 'Hmm, look at their faces. Are they happy or sad?',
    judgeYesKind: 'Yes! That was a kind choice!',
    judgeYesUnkind: 'You\'re right. That choice made their friend feel sad.',
    tryKinder: 'Let\'s watch them try a kinder way!',
    andThen: 'And then...',
    cheer: 'You are a peace helper!',
  },
  modes: [
    {
      id: 'share', title: 'Share', emoji: '🤝', rounds: 3,
      menuArt: './assets/props/toy-truck.png',
      menuHint: 'Play together',
      scenarios: [scenarios['toy-truck'], scenarios['red-crayon'], scenarios['storybook'], scenarios['big-ball']],
    },
    {
      id: 'take-turns', title: 'Take Turns', emoji: '🔄', rounds: 3,
      menuArt: './assets/props/drum.png',
      menuHint: 'Wait and swap',
      scenarios: [scenarios['slide'], scenarios['swing'], scenarios['drum'], scenarios['telescope']],
    },
    {
      id: 'ask-for-help', title: 'Ask for Help', emoji: '🙋', rounds: 3,
      menuArt: './assets/props/wagon.png',
      menuHint: 'Solve it together',
      scenarios: [scenarios['high-shelf'], scenarios['spilled-blocks'], scenarios['stuck-wagon'], scenarios['tangled-kite']],
    },
  ],
};
