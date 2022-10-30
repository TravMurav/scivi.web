#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from threading import Thread, Lock
import pygame
from pyGPIO.gpio import gpio, port
from time import sleep


class WordThread(Thread):
    def __init__(self, words, iterCnt, timeOut):
        
        self.TEXT_COLOR = (230, 231, 225)
        self.BACKGROUND_COLOR = (39, 40, 34)

        self.words = words
        self.iterCnt = iterCnt
        self.timeOut = timeOut
        self.mutex = Lock()
        self.wordShown = False
        self.renderRunning = False
        self.locked = False
        self.curIndex = -1
        self.curIter = -1
        Thread.__init__(self)

    def stop(self):
        if self.is_running():
            self.mutex.acquire()
            self.renderRunning = False
            self.mutex.release()
            self.join()

    def cur_word(self):
        self.mutex.acquire()
        if self.curIndex >= 0:
            result = self.words[self.curIndex]
        else:
            result = None
        self.mutex.release()
        return result

    def cur_iteration(self):
        self.mutex.acquire()
        result = self.curIter
        self.mutex.release()
        return result

    def is_running(self):
        self.mutex.acquire()
        result = self.renderRunning
        self.mutex.release()
        return result

    def is_locked(self):
        self.mutex.acquire()
        result = self.locked
        self.mutex.release()
        return result

    def set_locked(self, l):
        self.mutex.acquire()
        self.locked = l
        self.mutex.release()

    def create_text(self, msg, font):
        textRect = font.render(msg.strip(), True, self.TEXT_COLOR)
        w = textRect.get_width()
        h = textRect.get_height()
        result = pygame.Surface((w + 10, h + 10))
        result.fill(self.BACKGROUND_COLOR)
        result.blit(textRect, pygame.Rect(5, 5, w, h))
        return result

    def run(self):
        pygame.init()
        screen = pygame.display.set_mode((0, 0), pygame.FULLSCREEN)
        clock = pygame.time.Clock()
        screenSize = screen.get_size()
        pygame.mouse.set_visible(False)
        font = pygame.font.Font("lib/eeg/PermianSansTypeface-Bold.otf", 150)
        text = None
        elapsed = 0
        silence = 30000
        self.mutex.acquire()
        self.renderRunning = True
        self.curIter = 0
        self.mutex.release()
        gpio.init()
        gpio.setcfg(port.GPIO4, 1)
        sleep(10)
        gpio.output(port.GPIO4, 0)
        while self.is_running():
            for event in pygame.event.get():
                if event.type == pygame.QUIT or (event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE):
                    self.mutex.acquire()
                    self.renderRunning = False
                    self.mutex.release()
            if ((silence > 0) and (elapsed > silence)) or ((silence == 0) and (elapsed > self.timeOut) and (text or (not self.is_locked()))):
                elapsed = 0
                silence = 0
                if self.wordShown:
                    self.wordShown = False
                    text = self.create_text('█████', font)
                else:
                    self.wordShown = True
                    self.mutex.acquire()
                    self.curIndex += 1
                    if self.curIndex == len(self.words):
                        self.curIndex = 0
                        self.curIter += 1
                        if self.curIter == self.iterCnt:
                            self.renderRunning = False
                    if self.renderRunning:
                        text = self.create_text(self.words[self.curIndex], font)
                    self.mutex.release()
            screen.fill(self.BACKGROUND_COLOR)
            txtSize = text.get_size()
            screen.blit(text, ((screenSize[0] - txtSize[0]) // 2, (screenSize[1] - txtSize[1]) // 2))
            if self.wordShown:
                gpio.output(port.GPIO4, 1)
            else:
                gpio.output(port.GPIO4, 0)
                pass
            pygame.display.flip()
            elapsed += clock.tick(60)
        pygame.mouse.set_visible(True)
        pygame.quit()


if "wordThread" in GLOB:
    wordThread = GLOB["wordThread"]
else:
    words = SETTINGS_VAL["Words"]
    if words:
        wordThread = WordThread(list(map(lambda w: w.strip(), words.split("\n"))), int(SETTINGS_VAL["Iterations Count"]), int(SETTINGS_VAL["Timeout"]))
        GLOB["wordThread"] = wordThread
        REGISTER_SUBTHREAD(wordThread, wordThread.stop)
        wordThread.start()

wordThread.set_locked(INPUT.get("Locked", False))

OUTPUT["Word"] = wordThread.cur_word()
OUTPUT["Iteration"] = wordThread.cur_iteration()
